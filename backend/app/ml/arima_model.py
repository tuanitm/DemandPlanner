"""
ARIMA / SARIMA Model — Statistical time-series baseline.

Uses auto-order selection via AIC grid search or pmdarima's auto_arima
when available. Falls back to fixed ARIMA(1,1,1) for speed.

Captures:
  - Autoregressive patterns
  - Integrated differencing for stationarity
  - Moving average of residuals
  - Seasonal ARIMA (SARIMA) with period=12 for monthly data
"""
import logging
import warnings
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# Minimum data points for seasonal ARIMA (need at least 2 full seasons)
MIN_SARIMA_POINTS = 24
MIN_ARIMA_POINTS = 6


def forecast(
    series: list[float],
    horizon: int,
    **kwargs,
) -> dict:
    """
    Generate forecast using ARIMA/SARIMA.

    Args:
        series: chronological list of monthly quantities.
        horizon: number of months to forecast.

    Returns:
        dict with keys: forecast, lower, upper, model_name.
    """
    n = len(series)

    if n < MIN_ARIMA_POINTS:
        return _fallback_sma(series, horizon)

    # Try SARIMA first if enough data, then ARIMA, then SMA fallback
    if n >= MIN_SARIMA_POINTS:
        try:
            return _run_sarima(series, horizon)
        except Exception as e:
            logger.warning(f"SARIMA failed: {e}")

    try:
        return _run_arima(series, horizon)
    except Exception as e:
        logger.warning(f"ARIMA failed, falling back to SMA: {e}")
        return _fallback_sma(series, horizon)


def _run_sarima(series: list[float], horizon: int) -> dict:
    """Run Seasonal ARIMA with auto-order selection."""
    try:
        # Try pmdarima auto_arima first (best order selection)
        import pmdarima as pm

        model = pm.auto_arima(
            series,
            seasonal=True,
            m=12,                # Monthly seasonality
            max_p=3, max_q=3,
            max_P=2, max_Q=2,
            max_d=2, max_D=1,
            stepwise=True,
            suppress_warnings=True,
            error_action="ignore",
            trace=False,
            n_fits=30,
        )
        pred = model.predict(n_periods=horizon, return_conf_int=True, alpha=0.05)
        forecast_vals = [max(0, float(v)) for v in pred[0]]
        ci = pred[1]
        lower = [max(0, float(ci[i, 0])) for i in range(len(ci))]
        upper = [max(0, float(ci[i, 1])) for i in range(len(ci))]

        order_str = f"SARIMA{model.order}x{model.seasonal_order}"
        return {
            "forecast": forecast_vals,
            "lower": lower,
            "upper": upper,
            "model_name": order_str,
        }

    except ImportError:
        # pmdarima not installed, use statsmodels SARIMAX directly
        return _run_sarimax_fixed(series, horizon)


def _run_sarimax_fixed(series: list[float], horizon: int) -> dict:
    """Run SARIMAX with fixed order (1,1,1)(1,1,1,12)."""
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    model = SARIMAX(
        series,
        order=(1, 1, 1),
        seasonal_order=(1, 1, 1, 12),
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    fit = model.fit(disp=False, maxiter=200)
    pred = fit.get_forecast(steps=horizon)
    forecast_vals = [max(0, float(v)) for v in pred.predicted_mean]
    ci = pred.conf_int(alpha=0.05)
    ci_arr = np.asarray(ci)
    lower = [max(0, float(ci_arr[i, 0])) for i in range(len(ci_arr))]
    upper = [max(0, float(ci_arr[i, 1])) for i in range(len(ci_arr))]

    return {
        "forecast": forecast_vals,
        "lower": lower,
        "upper": upper,
        "model_name": "SARIMA(1,1,1)(1,1,1,12)",
    }


def _run_arima(series: list[float], horizon: int) -> dict:
    """Run non-seasonal ARIMA with AIC-based order selection."""
    from statsmodels.tsa.arima.model import ARIMA

    best_aic = np.inf
    best_model = None
    best_order = (1, 1, 1)

    # Search over common orders (reduced set for speed)
    common_orders = [
        (1, 1, 1), (1, 1, 0), (0, 1, 1), (2, 1, 1),
        (1, 1, 2), (2, 1, 2), (1, 0, 1), (1, 0, 0),
        (0, 0, 1), (2, 0, 1), (1, 2, 1), (0, 1, 2),
    ]

    for order in common_orders:
        p, d, q = order
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = ARIMA(series, order=(p, d, q))
                fit = model.fit()
                if fit.aic < best_aic:
                    best_aic = fit.aic
                    best_model = fit
                    best_order = (p, d, q)
        except Exception:
            continue

    if best_model is None:
        # Absolute fallback: ARIMA(1,1,1)
        model = ARIMA(series, order=(1, 1, 1))
        best_model = model.fit()
        best_order = (1, 1, 1)

    pred = best_model.get_forecast(steps=horizon)
    forecast_vals = [max(0, float(v)) for v in pred.predicted_mean]
    ci = pred.conf_int(alpha=0.05)
    ci_arr = np.asarray(ci)
    lower = [max(0, float(ci_arr[i, 0])) for i in range(len(ci_arr))]
    upper = [max(0, float(ci_arr[i, 1])) for i in range(len(ci_arr))]

    return {
        "forecast": forecast_vals,
        "lower": lower,
        "upper": upper,
        "model_name": f"ARIMA{best_order}",
    }


def _fallback_sma(series: list[float], horizon: int) -> dict:
    """Weighted 3-month SMA fallback for very short series."""
    if len(series) < 2:
        avg = series[0] if series else 0
        vals = [max(0, avg)] * horizon
        return {
            "forecast": vals,
            "lower": [max(0, v * 0.7) for v in vals],
            "upper": [v * 1.3 for v in vals],
            "model_name": "ARIMA-SMA-Fallback",
        }

    window = min(3, len(series))
    weights = list(range(1, window + 1))
    total_w = sum(weights)

    forecasts = []
    extended = list(series)
    for _ in range(horizon):
        recent = extended[-window:]
        val = sum(v * w for v, w in zip(recent, weights)) / total_w
        forecasts.append(max(0, val))
        extended.append(val)

    std = float(np.std(series))
    z = 1.645
    lower = [max(0, f - z * std) for f in forecasts]
    upper = [f + z * std for f in forecasts]

    return {
        "forecast": forecasts,
        "lower": lower,
        "upper": upper,
        "model_name": "ARIMA-SMA-Fallback",
    }
