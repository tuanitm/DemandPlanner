"""
Feature Engineering Pipeline for demand forecasting.

Transforms raw monthly time-series data into rich feature matrices
suitable for ML model consumption (XGBoost, LSTM, etc.).

Features generated:
  - Lag features (t-1 through t-6)
  - Rolling statistics (mean, std, min, max for 3- and 6-month windows)
  - Calendar features (month, quarter, year, sin/cos cyclic encoding)
  - Trend indicators (linear slope, momentum)
  - Coefficient of variation
"""
import numpy as np
import pandas as pd
from typing import Optional


def build_feature_dataframe(
    series: list[float],
    start_year: int,
    start_month: int,
) -> pd.DataFrame:
    """
    Build a feature-rich DataFrame from a monthly quantity time series.

    Args:
        series: list of monthly quantities in chronological order.
        start_year: year of the first data point.
        start_month: month of the first data point.

    Returns:
        DataFrame with columns: ds (datetime), y (target), and feature columns.
    """
    n = len(series)
    if n == 0:
        return pd.DataFrame()

    # Build date index
    dates = pd.date_range(
        start=f"{start_year}-{start_month:02d}-01",
        periods=n,
        freq="MS",
    )
    df = pd.DataFrame({"ds": dates, "y": series})

    # ── Calendar features ──
    df["month"] = df["ds"].dt.month
    df["quarter"] = df["ds"].dt.quarter
    df["year"] = df["ds"].dt.year
    df["day_of_year"] = df["ds"].dt.dayofyear

    # Cyclic encoding for month (captures Jan≈Dec proximity)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)

    # Cyclic encoding for quarter
    df["quarter_sin"] = np.sin(2 * np.pi * df["quarter"] / 4)
    df["quarter_cos"] = np.cos(2 * np.pi * df["quarter"] / 4)

    # ── Lag features ──
    for lag in range(1, 7):
        df[f"lag_{lag}"] = df["y"].shift(lag)

    # Year-over-year lag (if enough data)
    df["lag_12"] = df["y"].shift(12)

    # ── Rolling statistics ──
    for window in [3, 6]:
        df[f"rolling_mean_{window}"] = df["y"].shift(1).rolling(window, min_periods=1).mean()
        df[f"rolling_std_{window}"] = df["y"].shift(1).rolling(window, min_periods=1).std().fillna(0)
        df[f"rolling_min_{window}"] = df["y"].shift(1).rolling(window, min_periods=1).min()
        df[f"rolling_max_{window}"] = df["y"].shift(1).rolling(window, min_periods=1).max()

    # Expanding mean (all history)
    df["expanding_mean"] = df["y"].shift(1).expanding(min_periods=1).mean()

    # ── Trend indicators ──
    # Linear trend: slope of last 3 points
    df["trend_slope"] = _rolling_slope(df["y"].values, window=3)

    # Momentum: % change from 1 month ago
    df["momentum_1"] = df["y"].pct_change(1).fillna(0)
    # Momentum: % change from 3 months ago
    df["momentum_3"] = df["y"].pct_change(3).fillna(0)

    # ── Variability ──
    # Coefficient of variation (rolling 6-month)
    rolling_mean_6 = df["y"].shift(1).rolling(6, min_periods=2).mean()
    rolling_std_6 = df["y"].shift(1).rolling(6, min_periods=2).std().fillna(0)
    df["cv_6"] = np.where(rolling_mean_6 > 0, rolling_std_6 / rolling_mean_6, 0)

    # ── Time index (for linear trend models) ──
    df["time_index"] = np.arange(n)

    return df


def prepare_train_features(
    df: pd.DataFrame,
    target_col: str = "y",
    exclude_cols: Optional[list[str]] = None,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Extract X (features) and y (target) arrays from the feature DataFrame.
    Drops rows with NaN values (due to lags).

    Returns:
        (X, y, feature_names)
    """
    if exclude_cols is None:
        exclude_cols = ["ds", "y"]
    else:
        exclude_cols = list(set(exclude_cols + ["ds", "y"]))

    feature_cols = [c for c in df.columns if c not in exclude_cols]

    clean = df.dropna(subset=feature_cols + [target_col]).copy()
    if clean.empty:
        return np.array([]), np.array([]), feature_cols

    X = clean[feature_cols].values.astype(np.float64)
    y = clean[target_col].values.astype(np.float64)

    return X, y, feature_cols


def build_future_features(
    df: pd.DataFrame,
    horizon: int,
    last_values: Optional[list[float]] = None,
) -> pd.DataFrame:
    """
    Build feature rows for future periods (for prediction).
    Uses last known values extended with simple extrapolation.

    Args:
        df: historical feature DataFrame.
        horizon: number of future months.
        last_values: if provided, use these as the extension values.

    Returns:
        DataFrame with future feature rows.
    """
    if df.empty or horizon <= 0:
        return pd.DataFrame()

    last_date = df["ds"].iloc[-1]
    last_y = df["y"].iloc[-1]
    series = df["y"].tolist()

    future_rows = []
    extended_series = list(series)

    for h in range(horizon):
        future_date = last_date + pd.DateOffset(months=h + 1)

        row = {"ds": future_date, "y": np.nan}

        # Calendar features
        row["month"] = future_date.month
        row["quarter"] = (future_date.month - 1) // 3 + 1
        row["year"] = future_date.year
        row["day_of_year"] = future_date.timetuple().tm_yday
        row["month_sin"] = np.sin(2 * np.pi * row["month"] / 12)
        row["month_cos"] = np.cos(2 * np.pi * row["month"] / 12)
        row["quarter_sin"] = np.sin(2 * np.pi * row["quarter"] / 4)
        row["quarter_cos"] = np.cos(2 * np.pi * row["quarter"] / 4)

        # Lag features from extended series
        ext_len = len(extended_series)
        for lag in range(1, 7):
            idx = ext_len - lag
            row[f"lag_{lag}"] = extended_series[idx] if idx >= 0 else 0
        idx_12 = ext_len - 12
        row["lag_12"] = extended_series[idx_12] if idx_12 >= 0 else 0

        # Rolling statistics
        for window in [3, 6]:
            recent = extended_series[-window:] if len(extended_series) >= window else extended_series
            row[f"rolling_mean_{window}"] = np.mean(recent)
            row[f"rolling_std_{window}"] = np.std(recent) if len(recent) > 1 else 0
            row[f"rolling_min_{window}"] = np.min(recent)
            row[f"rolling_max_{window}"] = np.max(recent)

        row["expanding_mean"] = np.mean(extended_series)

        # Trend
        row["trend_slope"] = _compute_slope(extended_series[-3:]) if len(extended_series) >= 2 else 0
        row["momentum_1"] = (extended_series[-1] / extended_series[-2] - 1) if len(extended_series) >= 2 and extended_series[-2] != 0 else 0
        row["momentum_3"] = (extended_series[-1] / extended_series[-4] - 1) if len(extended_series) >= 4 and extended_series[-4] != 0 else 0

        # CV
        if len(extended_series) >= 2:
            recent_6 = extended_series[-6:] if len(extended_series) >= 6 else extended_series
            mean_6 = np.mean(recent_6)
            std_6 = np.std(recent_6)
            row["cv_6"] = std_6 / mean_6 if mean_6 > 0 else 0
        else:
            row["cv_6"] = 0

        row["time_index"] = len(series) + h

        future_rows.append(row)

        # Extend series with last known forecast (or simple repeat)
        if last_values and h < len(last_values):
            extended_series.append(last_values[h])
        else:
            extended_series.append(extended_series[-1])

    return pd.DataFrame(future_rows)


def _rolling_slope(values: np.ndarray, window: int = 3) -> np.ndarray:
    """Compute rolling linear slope over a window."""
    slopes = np.zeros(len(values))
    for i in range(len(values)):
        start = max(0, i - window + 1)
        segment = values[start:i + 1]
        if len(segment) >= 2:
            x = np.arange(len(segment))
            slopes[i] = _compute_slope(segment)
    return slopes


def _compute_slope(segment: list[float] | np.ndarray) -> float:
    """Compute linear slope for a segment."""
    if len(segment) < 2:
        return 0.0
    x = np.arange(len(segment))
    y = np.array(segment, dtype=np.float64)
    n = len(x)
    sx = x.sum()
    sy = y.sum()
    sxy = (x * y).sum()
    sx2 = (x * x).sum()
    denom = n * sx2 - sx * sx
    if denom == 0:
        return 0.0
    return float((n * sxy - sx * sy) / denom)
