"""
Demand Forecast Engine — orchestrates the full ML forecasting pipeline.

Pipeline:
  1. Fetch sales data from database
  2. Group by SKU-warehouse combination
  3. Run individual base models (Prophet, ARIMA, XGBoost, LSTM)
  4. Combine via stacking ensemble meta-learner
  5. Compute FA% via time-series backtesting
  6. Persist results to database

Models:
  - Prophet: trend + seasonality + holidays
  - ARIMA/SARIMA: statistical baseline with auto-order selection
  - XGBoost: gradient-boosted trees with engineered features
  - LSTM: neural network for long-term temporal patterns
  - Ensemble: Ridge meta-learner + Bayesian Model Averaging
"""
import logging
import warnings
from collections import defaultdict
from datetime import datetime
from typing import Optional

import numpy as np
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions import ActualSales
from app.models.forecasts import ForecastResult, ForecastAccuracy, ModelType
from app.config import settings

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)


async def generate_forecasts(
    db: AsyncSession,
    item_codes: Optional[list[str]] = None,
    warehouse_codes: Optional[list[str]] = None,
    horizon: int = None,
    start_year: Optional[int] = None,
    start_month: Optional[int] = None,
) -> dict:
    """
    Main entry point: generate forecasts for all SKU-warehouse combinations.

    Runs all base models, combines via ensemble, calculates accuracy,
    and persists results.

    Returns summary dict with counts and model performance.
    """
    if horizon is None:
        horizon = settings.FORECAST_HORIZON_MONTHS

    # 1. Fetch all sales data grouped by SKU-warehouse-period
    q = select(
        ActualSales.item_code,
        ActualSales.warehouse_code,
        ActualSales.year,
        ActualSales.month,
        func.sum(ActualSales.quantity).label("total_qty"),
    ).group_by(
        ActualSales.item_code,
        ActualSales.warehouse_code,
        ActualSales.year,
        ActualSales.month,
    )

    if item_codes:
        q = q.where(ActualSales.item_code.in_(item_codes))
    if warehouse_codes:
        q = q.where(ActualSales.warehouse_code.in_(warehouse_codes))

    q = q.order_by(ActualSales.year, ActualSales.month)
    result = await db.execute(q)
    rows = result.all()

    if not rows:
        return {"message": "No sales data found", "forecast_count": 0}

    # 2. Group by SKU-warehouse
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        key = (row.item_code, row.warehouse_code)
        grouped[key].append({
            "year": row.year,
            "month": row.month,
            "qty": float(row.total_qty),
        })

    # 3. Clear existing forecasts for the same scope
    from sqlalchemy import delete as sa_delete

    del_q = sa_delete(ForecastResult)
    if item_codes:
        del_q = del_q.where(ForecastResult.item_code.in_(item_codes))
    if warehouse_codes:
        del_q = del_q.where(ForecastResult.warehouse_code.in_(warehouse_codes))
    await db.execute(del_q)

    # 4. Generate forecasts for each SKU-warehouse combination
    all_forecast_records = []
    model_detail_records = []
    model_weights_log = {}

    for (item_code, warehouse_code), data_points in grouped.items():
        if start_year and start_month:
            target_absolute = start_year * 12 + start_month
            data_points = [dp for dp in data_points if (dp["year"] * 12 + dp["month"]) < target_absolute]
            
        if not data_points:
            continue
            
        series = [d["qty"] for d in data_points]
        actual_start_year = data_points[0]["year"]
        actual_start_month = data_points[0]["month"]
        last = data_points[-1]
        last_year, last_month = last["year"], last["month"]

        effective_horizon = horizon
        slice_start = 0
        
        if start_year and start_month:
            target_absolute = start_year * 12 + start_month
            last_absolute = last_year * 12 + last_month
            if target_absolute > last_absolute + 1:
                gap = target_absolute - (last_absolute + 1)
                effective_horizon = gap + horizon
                slice_start = gap

        logger.info(
            f"Forecasting {item_code}@{warehouse_code}: "
            f"{len(series)} months of data, effective_horizon={effective_horizon}, slice={slice_start}"
        )

        # ── Run individual base models ──
        individual_results = _run_base_models(
            series, effective_horizon, actual_start_year, actual_start_month
        )

        # ── Run stacking ensemble ──
        ensemble_result = _run_ensemble(
            series, effective_horizon, actual_start_year, actual_start_month
        )

        # Store model weights for reporting
        model_weights_log[(item_code, warehouse_code)] = ensemble_result.get(
            "model_weights", {}
        )

        # ── Save individual model results ──
        model_type_map = {
            "Prophet": ModelType.PROPHET,
            "ARIMA": ModelType.ARIMA,
            "XGBoost": ModelType.XGBOOST,
            "LSTM": ModelType.LSTM,
            "Bayesian": ModelType.BAYESIAN,
        }

        for model_name, result_data in individual_results.items():
            mt = model_type_map.get(model_name, ModelType.ENSEMBLE)
            sliced_forecast = result_data["forecast"][slice_start:slice_start + horizon]
            sliced_lower = result_data.get("lower", [])[slice_start:slice_start + horizon] if "lower" in result_data else []
            sliced_upper = result_data.get("upper", [])[slice_start:slice_start + horizon] if "upper" in result_data else []
            
            for j, f_qty in enumerate(sliced_forecast):
                y, m = _next_period(last_year, last_month, slice_start + j + 1)
                model_detail_records.append(ForecastResult(
                    item_code=item_code,
                    warehouse_code=warehouse_code,
                    year=y, month=m,
                    model_type=mt,
                    forecast_qty=round(max(0, f_qty)),
                    confidence_lower=round(sliced_lower[j]) if j < len(sliced_lower) else None,
                    confidence_upper=round(sliced_upper[j]) if j < len(sliced_upper) else None,
                ))

        # ── Save ensemble result ──
        ens_sliced_forecast = ensemble_result["forecast"][slice_start:slice_start + horizon]
        ens_sliced_lower = ensemble_result.get("lower", [])[slice_start:slice_start + horizon] if "lower" in ensemble_result else []
        ens_sliced_upper = ensemble_result.get("upper", [])[slice_start:slice_start + horizon] if "upper" in ensemble_result else []
        
        for j, f_qty in enumerate(ens_sliced_forecast):
            y, m = _next_period(last_year, last_month, slice_start + j + 1)
            lower = ens_sliced_lower[j] if j < len(ens_sliced_lower) else None
            upper = ens_sliced_upper[j] if j < len(ens_sliced_upper) else None
            all_forecast_records.append(ForecastResult(
                item_code=item_code,
                warehouse_code=warehouse_code,
                year=y, month=m,
                model_type=ModelType.ENSEMBLE,
                forecast_qty=round(max(0, f_qty)),
                confidence_lower=round(lower) if lower is not None else None,
                confidence_upper=round(upper) if upper is not None else None,
            ))

    # Persist all results
    db.add_all(model_detail_records)
    db.add_all(all_forecast_records)
    await db.flush()

    # 5. Calculate accuracy for historical periods
    accuracy_count = await calculate_accuracy(db, item_codes, warehouse_codes)

    return {
        "message": "Forecast generated successfully",
        "combinations": len(grouped),
        "forecast_count": len(all_forecast_records),
        "model_detail_count": len(model_detail_records),
        "accuracy_records": accuracy_count,
        "horizon_months": horizon,
        "model_weights": {
            f"{ic}@{wc}": weights
            for (ic, wc), weights in model_weights_log.items()
        },
    }


def _run_base_models(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
) -> dict[str, dict]:
    """Run all base models and return their results."""
    from app.ml import prophet_model, arima_model, xgboost_model, lstm_model

    results = {}

    # Prophet
    try:
        results["Prophet"] = prophet_model.forecast(
            series=series,
            horizon=horizon,
            start_year=start_year,
            start_month=start_month,
        )
        logger.info(f"  Prophet: {results['Prophet']['model_name']}")
    except Exception as e:
        logger.warning(f"  Prophet failed: {e}")

    # ARIMA
    try:
        results["ARIMA"] = arima_model.forecast(
            series=series,
            horizon=horizon,
        )
        logger.info(f"  ARIMA: {results['ARIMA']['model_name']}")
    except Exception as e:
        logger.warning(f"  ARIMA failed: {e}")

    # XGBoost
    try:
        results["XGBoost"] = xgboost_model.forecast(
            series=series,
            horizon=horizon,
            start_year=start_year,
            start_month=start_month,
        )
        logger.info(f"  XGBoost: {results['XGBoost']['model_name']}")
    except Exception as e:
        logger.warning(f"  XGBoost failed: {e}")

    # LSTM
    try:
        results["LSTM"] = lstm_model.forecast(
            series=series,
            horizon=horizon,
        )
        logger.info(f"  LSTM: {results['LSTM']['model_name']}")
    except Exception as e:
        logger.warning(f"  LSTM failed: {e}")

    return results


def _run_ensemble(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
) -> dict:
    """Run stacking ensemble meta-learner."""
    from app.ml.ensemble import forecast as ensemble_forecast

    try:
        result = ensemble_forecast(
            series=series,
            horizon=horizon,
            start_year=start_year,
            start_month=start_month,
        )
        logger.info(
            f"  Ensemble: {result['model_name']} "
            f"(weights: {result.get('model_weights', {})})"
        )
        return result
    except Exception as e:
        logger.error(f"  Ensemble failed: {e}")
        # Emergency fallback: use SMA
        avg = np.mean(series) if series else 0
        vals = [max(0, float(avg))] * horizon
        return {
            "forecast": vals,
            "lower": [max(0, v * 0.7) for v in vals],
            "upper": [v * 1.3 for v in vals],
            "model_name": "Fallback-SMA",
            "model_weights": {},
        }


async def calculate_accuracy(
    db: AsyncSession,
    item_codes: Optional[list[str]] = None,
    warehouse_codes: Optional[list[str]] = None,
) -> int:
    """
    Calculate FA% by comparing forecast vs actual for overlapping periods.

    Uses time-series backtesting: trains on first 80% of data,
    forecasts the last 20%, then computes FA% per period.
    """
    from sqlalchemy import delete as sa_delete
    from app.ml import prophet_model, arima_model, xgboost_model
    from app.ml.bayesian_blend import compute_model_weights, blend_forecasts

    # Clear existing accuracy records
    del_q = sa_delete(ForecastAccuracy)
    if item_codes:
        del_q = del_q.where(ForecastAccuracy.item_code.in_(item_codes))
    if warehouse_codes:
        del_q = del_q.where(ForecastAccuracy.warehouse_code.in_(warehouse_codes))
    await db.execute(del_q)

    # Get grouped sales data
    q = select(
        ActualSales.item_code,
        ActualSales.warehouse_code,
        ActualSales.year,
        ActualSales.month,
        func.sum(ActualSales.quantity).label("total_qty"),
    ).group_by(
        ActualSales.item_code, ActualSales.warehouse_code,
        ActualSales.year, ActualSales.month,
    ).order_by(ActualSales.year, ActualSales.month)

    if item_codes:
        q = q.where(ActualSales.item_code.in_(item_codes))
    if warehouse_codes:
        q = q.where(ActualSales.warehouse_code.in_(warehouse_codes))

    result = await db.execute(q)
    rows = result.all()

    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        grouped[(row.item_code, row.warehouse_code)].append({
            "year": row.year, "month": row.month, "qty": float(row.total_qty),
        })

    accuracy_records = []
    for (item_code, warehouse_code), data_points in grouped.items():
        if len(data_points) < 4:
            continue

        # Backtest: train on first 80%, test on last 20%
        split = max(3, int(len(data_points) * 0.8))
        train = [d["qty"] for d in data_points[:split]]
        test_points = data_points[split:]

        if not test_points:
            continue

        test_horizon = len(test_points)
        start_year = data_points[0]["year"]
        start_month = data_points[0]["month"]

        # Quick ensemble of available models for backtest
        model_forecasts = {}
        try:
            model_forecasts["Prophet"] = prophet_model.forecast(
                series=train, horizon=test_horizon,
                start_year=start_year, start_month=start_month,
            )
        except Exception:
            pass
        try:
            model_forecasts["ARIMA"] = arima_model.forecast(
                series=train, horizon=test_horizon,
            )
        except Exception:
            pass
        try:
            model_forecasts["XGBoost"] = xgboost_model.forecast(
                series=train, horizon=test_horizon,
                start_year=start_year, start_month=start_month,
            )
        except Exception:
            pass

        if not model_forecasts:
            continue

        # BMA blend for backtest
        test_actuals = [d["qty"] for d in test_points]
        oos_preds = {
            name: r["forecast"][:test_horizon]
            for name, r in model_forecasts.items()
        }
        weights = compute_model_weights(oos_preds, test_actuals)
        blended = blend_forecasts(model_forecasts, weights)

        # Compute FA% per period
        for i, dp in enumerate(test_points):
            actual = dp["qty"]
            if i < len(blended["forecast"]):
                forecast_val = blended["forecast"][i]
            else:
                forecast_val = 0

            if actual > 0:
                fa = max(0, (1 - abs(forecast_val - actual) / actual)) * 100
            else:
                fa = 100.0 if forecast_val == 0 else 0.0

            accuracy_records.append(ForecastAccuracy(
                item_code=item_code,
                warehouse_code=warehouse_code,
                year=dp["year"],
                month=dp["month"],
                forecast_qty=round(forecast_val),
                actual_qty=round(actual),
                fa_percent=round(fa, 1),
                model_type=ModelType.ENSEMBLE,
            ))

    if accuracy_records:
        db.add_all(accuracy_records)
        await db.flush()

    return len(accuracy_records)


def _next_period(year: int, month: int, offset: int) -> tuple[int, int]:
    """Calculate year, month after adding offset months."""
    total_months = (year * 12 + month - 1) + offset
    return total_months // 12, (total_months % 12) + 1
