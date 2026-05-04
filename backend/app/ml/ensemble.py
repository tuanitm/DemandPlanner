"""
Stacking Ensemble Meta-Learner.

Combines out-of-sample predictions from base models
(Prophet, ARIMA, XGBoost, LSTM) using a Ridge Regression meta-learner.

Process:
  1. Split historical data into train/validation using time-series CV
  2. Each base model generates out-of-sample (OOS) predictions on validation
  3. Meta-learner (Ridge) is trained on OOS predictions → actual values
  4. For final forecast, each base model forecasts the future horizon
  5. Meta-learner blends base forecasts into the final prediction

This approach automatically learns which models perform best and
how to optimally combine them, adapting per SKU-warehouse series.
"""
import logging
import warnings
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

MIN_ENSEMBLE_POINTS = 12  # Need enough for train/val split across base models


def forecast(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
    use_pymc_bma: bool = False,
) -> dict:
    """
    Generate ensemble forecast using stacking meta-learner.

    Args:
        series: chronological monthly quantities.
        horizon: number of months to forecast.
        start_year: year of first data point.
        start_month: month of first data point.
        use_pymc_bma: whether to use PyMC for Bayesian weight estimation.

    Returns:
        dict with keys: forecast, lower, upper, model_name,
        model_weights (dict), individual_forecasts (dict).
    """
    n = len(series)

    if n < MIN_ENSEMBLE_POINTS:
        return _simple_average_ensemble(series, horizon, start_year, start_month)

    try:
        return _run_stacking_ensemble(series, horizon, start_year, start_month, use_pymc_bma)
    except Exception as e:
        logger.error(f"Stacking ensemble failed: {e}")
        return _simple_average_ensemble(series, horizon, start_year, start_month)


def _run_stacking_ensemble(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
    use_pymc_bma: bool,
) -> dict:
    """Full stacking ensemble with Ridge meta-learner."""
    from sklearn.linear_model import Ridge

    from app.ml import prophet_model, arima_model, xgboost_model, lstm_model
    from app.ml.bayesian_blend import (
        compute_model_weights,
        compute_weights_pymc,
        blend_forecasts,
    )

    n = len(series)

    # ── Step 1: Time-series CV split ──
    # Use last 20% for validation (OOS predictions)
    val_size = max(3, n // 5)
    train_size = n - val_size
    train_series = series[:train_size]
    val_actuals = series[train_size:]

    # Compute start year/month for train
    train_start_year = start_year
    train_start_month = start_month

    # ── Step 2: Generate OOS predictions from each base model ──
    base_models = {
        "Prophet": prophet_model,
        "ARIMA": arima_model,
        "XGBoost": xgboost_model,
        "LSTM": lstm_model,
    }

    oos_predictions = {}
    model_results = {}

    for name, model_module in base_models.items():
        try:
            kwargs = {}
            if name in ("Prophet", "XGBoost"):
                kwargs["start_year"] = train_start_year
                kwargs["start_month"] = train_start_month

            result = model_module.forecast(
                series=train_series,
                horizon=val_size,
                **kwargs,
            )
            oos_predictions[name] = result["forecast"][:val_size]
            logger.info(
                f"  {name} OOS RMSE: "
                f"{_rmse(val_actuals, result['forecast'][:val_size]):.1f}"
            )
        except Exception as e:
            logger.warning(f"  {name} OOS failed: {e}")

    if len(oos_predictions) < 2:
        logger.warning("Too few models succeeded for stacking, using simple average")
        return _simple_average_ensemble(series, horizon, start_year, start_month)

    # ── Step 3: Train meta-learner on OOS predictions ──
    # Method A: Ridge Regression meta-learner
    model_names = list(oos_predictions.keys())
    oos_matrix = np.column_stack([
        np.array(oos_predictions[name][:val_size]) for name in model_names
    ])

    val_arr = np.array(val_actuals[:oos_matrix.shape[0]])
    if len(val_arr) < oos_matrix.shape[0]:
        oos_matrix = oos_matrix[:len(val_arr)]

    meta_learner = Ridge(alpha=1.0, fit_intercept=True)
    meta_learner.fit(oos_matrix, val_arr)

    # Extract learned weights (normalize coefficients)
    raw_weights = meta_learner.coef_
    # Ensure non-negative weights
    pos_weights = np.maximum(raw_weights, 0)
    total = pos_weights.sum()
    if total > 0:
        ridge_weights = {name: float(w / total) for name, w in zip(model_names, pos_weights)}
    else:
        ridge_weights = {name: 1.0 / len(model_names) for name in model_names}

    # Method B: Bayesian Model Averaging weights
    if use_pymc_bma:
        bma_weights = compute_weights_pymc(oos_predictions, val_actuals)
    else:
        bma_weights = compute_model_weights(oos_predictions, val_actuals)

    # Average Ridge and BMA weights for robustness
    final_weights = {}
    all_names = set(list(ridge_weights.keys()) + list(bma_weights.keys()))
    for name in all_names:
        w_ridge = ridge_weights.get(name, 0)
        w_bma = bma_weights.get(name, 0)
        final_weights[name] = (w_ridge + w_bma) / 2

    # Re-normalize
    total = sum(final_weights.values())
    if total > 0:
        final_weights = {k: v / total for k, v in final_weights.items()}

    logger.info(f"Final ensemble weights: {final_weights}")

    # ── Step 4: Generate future forecasts from each base model (using FULL data) ──
    individual_forecasts = {}

    for name, model_module in base_models.items():
        if name not in final_weights or final_weights[name] < 0.01:
            continue
        try:
            kwargs = {}
            if name in ("Prophet", "XGBoost"):
                kwargs["start_year"] = start_year
                kwargs["start_month"] = start_month

            result = model_module.forecast(
                series=series,  # Full series for final forecast
                horizon=horizon,
                **kwargs,
            )
            individual_forecasts[name] = result
            model_results[name] = result
        except Exception as e:
            logger.warning(f"  {name} final forecast failed: {e}")
            final_weights.pop(name, None)

    if not individual_forecasts:
        return _simple_average_ensemble(series, horizon, start_year, start_month)

    # Re-normalize weights after any failures
    total = sum(final_weights.get(k, 0) for k in individual_forecasts)
    if total > 0:
        final_weights = {
            k: final_weights.get(k, 0) / total
            for k in individual_forecasts
        }

    # ── Step 5: Blend using meta-learner weights ──
    blended = blend_forecasts(individual_forecasts, final_weights)

    # Also apply Ridge meta-learner directly for comparison
    ridge_forecast = _apply_ridge_meta(
        meta_learner, individual_forecasts, model_names, horizon
    )

    # Average meta-learner and BMA blended forecasts
    final_forecast = []
    final_lower = []
    final_upper = []
    for i in range(horizon):
        f_bma = blended["forecast"][i] if i < len(blended["forecast"]) else 0
        f_ridge = ridge_forecast[i] if i < len(ridge_forecast) else 0
        final_forecast.append(max(0, (f_bma + f_ridge) / 2))

        l = blended["lower"][i] if i < len(blended["lower"]) else 0
        u = blended["upper"][i] if i < len(blended["upper"]) else 0
        final_lower.append(max(0, l))
        final_upper.append(max(0, u))

    return {
        "forecast": [round(v) for v in final_forecast],
        "lower": [round(v) for v in final_lower],
        "upper": [round(v) for v in final_upper],
        "model_name": "Stacking-Ensemble",
        "model_weights": final_weights,
        "individual_forecasts": {
            name: {
                "forecast": r["forecast"],
                "model_name": r["model_name"],
            }
            for name, r in model_results.items()
        },
    }


def _apply_ridge_meta(
    meta_learner,
    individual_forecasts: dict,
    model_names: list[str],
    horizon: int,
) -> list[float]:
    """Apply the trained Ridge meta-learner to blend future forecasts."""
    # Build prediction matrix
    pred_matrix = []
    for name in model_names:
        if name in individual_forecasts:
            vals = individual_forecasts[name]["forecast"][:horizon]
            if len(vals) < horizon:
                vals = list(vals) + [vals[-1]] * (horizon - len(vals))
            pred_matrix.append(vals)
        else:
            pred_matrix.append([0] * horizon)

    X_future = np.column_stack([np.array(p) for p in pred_matrix])
    result = meta_learner.predict(X_future)
    return [max(0, float(v)) for v in result]


def _simple_average_ensemble(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
) -> dict:
    """Simple average ensemble for short series where stacking isn't viable."""
    from app.ml import prophet_model, arima_model, xgboost_model

    results = {}
    for name, module, kwargs in [
        ("Prophet", prophet_model, {"start_year": start_year, "start_month": start_month}),
        ("ARIMA", arima_model, {}),
        ("XGBoost", xgboost_model, {"start_year": start_year, "start_month": start_month}),
    ]:
        try:
            results[name] = module.forecast(series=series, horizon=horizon, **kwargs)
        except Exception as e:
            logger.warning(f"  {name} failed in simple ensemble: {e}")

    if not results:
        avg = np.mean(series) if series else 0
        vals = [max(0, float(avg))] * horizon
        return {
            "forecast": vals,
            "lower": [max(0, v * 0.7) for v in vals],
            "upper": [v * 1.3 for v in vals],
            "model_name": "Ensemble-Naive-Fallback",
            "model_weights": {},
            "individual_forecasts": {},
        }

    n_models = len(results)
    weights = {name: 1.0 / n_models for name in results}

    from app.ml.bayesian_blend import blend_forecasts
    blended = blend_forecasts(results, weights)
    blended["model_weights"] = weights
    blended["individual_forecasts"] = {
        name: {"forecast": r["forecast"], "model_name": r["model_name"]}
        for name, r in results.items()
    }
    blended["model_name"] = "Simple-Average-Ensemble"
    return blended


def _rmse(actual: list[float], predicted: list[float]) -> float:
    """Compute Root Mean Squared Error."""
    n = min(len(actual), len(predicted))
    if n == 0:
        return float("inf")
    a = np.array(actual[:n])
    p = np.array(predicted[:n])
    return float(np.sqrt(np.mean((a - p) ** 2)))
