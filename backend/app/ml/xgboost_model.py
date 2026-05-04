"""
XGBoost Model — Gradient-boosted tree for demand forecasting.

Uses the feature engineering pipeline to create a rich feature matrix,
then trains XGBoost regressor with time-series cross-validation.

Handles exogenous features:
  - Calendar/cyclic features
  - Lag features (multi-step)
  - Rolling statistics
  - Trend indicators

Supports recursive multi-step forecasting.
"""
import logging
import warnings
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore", category=FutureWarning)

MIN_XGBOOST_POINTS = 12  # Need at least 1 year for meaningful feature construction


def forecast(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
    **kwargs,
) -> dict:
    """
    Generate forecast using XGBoost with engineered features.

    Args:
        series: chronological list of monthly quantities.
        horizon: number of months to forecast.
        start_year: year of first data point.
        start_month: month of first data point.

    Returns:
        dict with keys: forecast, lower, upper, model_name.
    """
    n = len(series)

    if n < MIN_XGBOOST_POINTS:
        return _fallback_linear(series, horizon)

    try:
        return _run_xgboost(series, horizon, start_year, start_month)
    except Exception as e:
        logger.warning(f"XGBoost failed, falling back to Linear: {e}")
        return _fallback_linear(series, horizon)


def _run_xgboost(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
) -> dict:
    """Run XGBoost with feature engineering and recursive forecasting."""
    import xgboost as xgb
    from app.ml.features import (
        build_feature_dataframe,
        prepare_train_features,
        build_future_features,
    )

    # Build feature DataFrame
    df = build_feature_dataframe(series, start_year, start_month)
    X_train, y_train, feature_cols = prepare_train_features(df)

    if len(X_train) < 6:
        return _fallback_linear(series, horizon)

    # Time-series cross-validation for hyperparameter tuning
    best_params = _tune_hyperparams(X_train, y_train)

    # Train final model on all data
    model = xgb.XGBRegressor(
        n_estimators=best_params.get("n_estimators", 200),
        max_depth=best_params.get("max_depth", 4),
        learning_rate=best_params.get("learning_rate", 0.05),
        min_child_weight=best_params.get("min_child_weight", 3),
        subsample=best_params.get("subsample", 0.8),
        colsample_bytree=best_params.get("colsample_bytree", 0.8),
        reg_alpha=best_params.get("reg_alpha", 0.1),
        reg_lambda=best_params.get("reg_lambda", 1.0),
        random_state=42,
        objective="reg:squarederror",
        verbosity=0,
    )
    model.fit(X_train, y_train)

    # Recursive multi-step forecasting
    forecast_vals = []
    future_df = build_future_features(df, horizon)

    for h in range(horizon):
        row = future_df.iloc[h]
        X_pred = np.array([[row[c] for c in feature_cols]], dtype=np.float64)
        # Handle NaN in features
        X_pred = np.nan_to_num(X_pred, nan=0.0)
        pred = float(model.predict(X_pred)[0])
        pred = max(0, pred)
        forecast_vals.append(pred)

        # Update future features with the prediction for recursive forecasting
        if h + 1 < horizon:
            _update_future_row(future_df, h + 1, pred, feature_cols)

    # Confidence intervals from training residuals
    train_pred = model.predict(X_train)
    residuals = y_train - train_pred
    residual_std = float(np.std(residuals))
    z = 1.645  # 95% confidence

    lower = [max(0, f - z * residual_std * np.sqrt(i + 1)) for i, f in enumerate(forecast_vals)]
    upper = [f + z * residual_std * np.sqrt(i + 1) for i, f in enumerate(forecast_vals)]

    return {
        "forecast": forecast_vals,
        "lower": lower,
        "upper": upper,
        "model_name": "XGBoost",
    }


def _tune_hyperparams(X: np.ndarray, y: np.ndarray) -> dict:
    """
    Quick time-series cross-validation to select hyperparameters.
    Uses expanding window validation (respects temporal order).
    """
    import xgboost as xgb

    n = len(X)
    if n < 12:
        # Not enough data for CV, use defaults
        return {
            "n_estimators": 100,
            "max_depth": 3,
            "learning_rate": 0.1,
            "min_child_weight": 3,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "reg_alpha": 0.1,
            "reg_lambda": 1.0,
        }

    # Parameter grid (keep small for speed)
    param_candidates = [
        {"n_estimators": 100, "max_depth": 3, "learning_rate": 0.1},
        {"n_estimators": 200, "max_depth": 4, "learning_rate": 0.05},
        {"n_estimators": 150, "max_depth": 5, "learning_rate": 0.05},
    ]

    best_score = np.inf
    best_params = param_candidates[0]

    # Expanding window CV (3 folds)
    n_folds = 3
    fold_size = max(1, n // (n_folds + 1))
    min_train = max(6, n // 3)

    for params in param_candidates:
        fold_errors = []
        for fold in range(n_folds):
            train_end = min_train + fold * fold_size
            val_end = min(train_end + fold_size, n)
            if train_end >= n or val_end > n:
                break

            X_tr, y_tr = X[:train_end], y[:train_end]
            X_val, y_val = X[train_end:val_end], y[train_end:val_end]

            model = xgb.XGBRegressor(
                **params,
                min_child_weight=3,
                subsample=0.8,
                colsample_bytree=0.8,
                reg_alpha=0.1,
                reg_lambda=1.0,
                random_state=42,
                objective="reg:squarederror",
                verbosity=0,
            )
            model.fit(X_tr, y_tr)
            pred = model.predict(X_val)
            # RMSE
            rmse = float(np.sqrt(np.mean((y_val - pred) ** 2)))
            fold_errors.append(rmse)

        if fold_errors:
            avg_error = np.mean(fold_errors)
            if avg_error < best_score:
                best_score = avg_error
                best_params = params

    # Merge with defaults
    defaults = {
        "min_child_weight": 3,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "reg_alpha": 0.1,
        "reg_lambda": 1.0,
    }
    defaults.update(best_params)
    return defaults


def _update_future_row(df, idx: int, pred_value: float, feature_cols: list[str]):
    """Update lag features in future row with predicted value."""
    # Shift lags
    for lag in range(6, 1, -1):
        col = f"lag_{lag}"
        prev_col = f"lag_{lag - 1}"
        if col in df.columns and prev_col in df.columns:
            df.loc[df.index[idx], col] = df.loc[df.index[idx - 1], prev_col]
    if "lag_1" in df.columns:
        df.loc[df.index[idx], "lag_1"] = pred_value


def _fallback_linear(series: list[float], horizon: int) -> dict:
    """Linear regression fallback for short series."""
    try:
        from sklearn.linear_model import LinearRegression

        if len(series) < 2:
            avg = series[0] if series else 0
            vals = [max(0, avg)] * horizon
            return {
                "forecast": vals,
                "lower": [max(0, v * 0.7) for v in vals],
                "upper": [v * 1.3 for v in vals],
                "model_name": "XGBoost-Naive-Fallback",
            }

        X = np.arange(len(series)).reshape(-1, 1)
        y = np.array(series)
        model = LinearRegression().fit(X, y)

        future_X = np.arange(len(series), len(series) + horizon).reshape(-1, 1)
        forecast_vals = [max(0, float(v)) for v in model.predict(future_X)]

        residuals = y - model.predict(X)
        std = float(np.std(residuals)) if len(residuals) > 1 else float(np.std(series)) * 0.2
        z = 1.645
        lower = [max(0, f - z * std) for f in forecast_vals]
        upper = [f + z * std for f in forecast_vals]

        return {
            "forecast": forecast_vals,
            "lower": lower,
            "upper": upper,
            "model_name": "XGBoost-Linear-Fallback",
        }
    except Exception:
        avg = np.mean(series) if series else 0
        vals = [max(0, float(avg))] * horizon
        return {
            "forecast": vals,
            "lower": [max(0, v * 0.7) for v in vals],
            "upper": [v * 1.3 for v in vals],
            "model_name": "XGBoost-Naive-Fallback",
        }
