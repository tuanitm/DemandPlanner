"""
Prophet Model — Facebook Prophet for demand forecasting.

Captures:
  - Trend (linear or logistic growth)
  - Yearly seasonality
  - Monthly patterns
  - Holiday effects (Vietnamese holidays)

Gracefully degrades to SimpleExponentialSmoothing for short series (<24 months).
"""
import logging
import warnings
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore", category=FutureWarning)

# Minimum data points for Prophet to be meaningful
MIN_PROPHET_POINTS = 24  # 2 years of monthly data
MIN_ETS_POINTS = 3


def forecast(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
    country_holidays: str = "VN",
) -> dict:
    """
    Generate forecast using Facebook Prophet.

    Args:
        series: chronological list of monthly quantities.
        horizon: number of months to forecast.
        start_year: year of first data point.
        start_month: month of first data point.
        country_holidays: country code for holiday effects.

    Returns:
        dict with keys: forecast (list[float]), lower (list[float]),
        upper (list[float]), model_name (str).
    """
    n = len(series)

    if n < MIN_ETS_POINTS:
        return _fallback_naive(series, horizon)

    if n < MIN_PROPHET_POINTS:
        return _fallback_ets(series, horizon)

    try:
        return _run_prophet(series, horizon, start_year, start_month, country_holidays)
    except Exception as e:
        logger.warning(f"Prophet failed, falling back to ETS: {e}")
        return _fallback_ets(series, horizon)


def _run_prophet(
    series: list[float],
    horizon: int,
    start_year: int,
    start_month: int,
    country_holidays: str,
) -> dict:
    """Run full Prophet model."""
    from prophet import Prophet

    # Build Prophet DataFrame
    dates = pd.date_range(
        start=f"{start_year}-{start_month:02d}-01",
        periods=len(series),
        freq="MS",
    )
    df = pd.DataFrame({"ds": dates, "y": series})

    # Configure Prophet
    model = Prophet(
        growth="linear",
        yearly_seasonality=True,
        weekly_seasonality=False,   # Monthly data, no weekly pattern
        daily_seasonality=False,
        seasonality_mode="multiplicative",
        interval_width=0.95,
        changepoint_prior_scale=0.05,  # Conservative trend changes
    )

    # Add Vietnamese holidays
    try:
        model.add_country_holidays(country_name=country_holidays)
    except Exception:
        logger.debug(f"Could not add holidays for {country_holidays}")

    # Add monthly seasonality if enough data
    if len(series) >= 12:
        model.add_seasonality(
            name="monthly",
            period=30.5,
            fourier_order=3,
        )

    # Suppress Prophet logging
    with _suppress_stdout():
        model.fit(df)

    # Make future DataFrame
    future = model.make_future_dataframe(periods=horizon, freq="MS")
    prediction = model.predict(future)

    # Extract forecast for future periods only
    future_pred = prediction.tail(horizon)
    forecast_vals = [max(0, float(v)) for v in future_pred["yhat"]]
    lower_vals = [max(0, float(v)) for v in future_pred["yhat_lower"]]
    upper_vals = [max(0, float(v)) for v in future_pred["yhat_upper"]]

    return {
        "forecast": forecast_vals,
        "lower": lower_vals,
        "upper": upper_vals,
        "model_name": "Prophet",
    }


def _fallback_ets(series: list[float], horizon: int) -> dict:
    """Exponential Smoothing fallback for short series."""
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        model = ExponentialSmoothing(
            series,
            trend="add" if len(series) >= 4 else None,
            seasonal=None,
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True)
        result = fit.forecast(horizon)
        forecast_vals = [max(0, float(v)) for v in result]

        # Approximate confidence interval
        std = float(np.std(series))
        z = 1.645
        lower = [max(0, f - z * std) for f in forecast_vals]
        upper = [f + z * std for f in forecast_vals]

        return {
            "forecast": forecast_vals,
            "lower": lower,
            "upper": upper,
            "model_name": "Prophet-ETS-Fallback",
        }
    except Exception as e:
        logger.warning(f"ETS fallback also failed: {e}")
        return _fallback_naive(series, horizon)


def _fallback_naive(series: list[float], horizon: int) -> dict:
    """Last-value repeat for very short series."""
    avg = np.mean(series) if series else 0
    forecast_vals = [max(0, float(avg))] * horizon
    return {
        "forecast": forecast_vals,
        "lower": [max(0, v * 0.7) for v in forecast_vals],
        "upper": [v * 1.3 for v in forecast_vals],
        "model_name": "Prophet-Naive-Fallback",
    }


class _suppress_stdout:
    """Context manager to suppress Prophet's verbose stdout output."""
    def __enter__(self):
        import sys
        import os
        self._original_stdout = sys.stdout
        sys.stdout = open(os.devnull, "w")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        import sys
        sys.stdout.close()
        sys.stdout = self._original_stdout
