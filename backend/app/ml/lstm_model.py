"""
LSTM Model — Long Short-Term Memory neural network for demand forecasting.

Architecture:
  - Input: sequence of N months (lookback window)
  - LSTM layer(s) with dropout for regularization
  - Dense output layer for multi-step prediction

Handles:
  - Long-term temporal dependencies
  - Non-linear patterns
  - Data normalization (MinMaxScaler)

Falls back to ETS for series shorter than the lookback window.
"""
import logging
import warnings
import os
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore", category=FutureWarning)

# Suppress TensorFlow verbose logging
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

LOOKBACK = 6          # Input sequence length (months)
MIN_LSTM_POINTS = 18  # Need lookback + enough for train/val split
EPOCHS = 100
BATCH_SIZE = 4


def forecast(
    series: list[float],
    horizon: int,
    **kwargs,
) -> dict:
    """
    Generate forecast using LSTM neural network.

    Args:
        series: chronological list of monthly quantities.
        horizon: number of months to forecast.

    Returns:
        dict with keys: forecast, lower, upper, model_name.
    """
    n = len(series)

    if n < MIN_LSTM_POINTS:
        return _fallback_ets(series, horizon)

    try:
        return _run_lstm(series, horizon)
    except Exception as e:
        logger.warning(f"LSTM failed, falling back to ETS: {e}")
        return _fallback_ets(series, horizon)


def _run_lstm(series: list[float], horizon: int) -> dict:
    """Run LSTM model with proper scaling and sequence creation."""
    # Lazy imports to avoid slow TensorFlow startup on every module load
    import tensorflow as tf
    from tensorflow import keras

    # Suppress TF logging
    tf.get_logger().setLevel("ERROR")

    data = np.array(series, dtype=np.float64)

    # Normalize data
    data_min = data.min()
    data_max = data.max()
    data_range = data_max - data_min
    if data_range == 0:
        data_range = 1.0
    scaled = (data - data_min) / data_range

    # Create sequences
    X, y = _create_sequences(scaled, LOOKBACK)

    if len(X) < 4:
        return _fallback_ets(series, horizon)

    # Train/validation split (last 20% for validation)
    split = max(1, int(len(X) * 0.8))
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    # Reshape for LSTM: [samples, timesteps, features]
    X_train = X_train.reshape(-1, LOOKBACK, 1)
    X_val = X_val.reshape(-1, LOOKBACK, 1)

    # Build model
    model = keras.Sequential([
        keras.layers.LSTM(
            64,
            activation="tanh",
            return_sequences=True,
            input_shape=(LOOKBACK, 1),
        ),
        keras.layers.Dropout(0.2),
        keras.layers.LSTM(32, activation="tanh"),
        keras.layers.Dropout(0.2),
        keras.layers.Dense(16, activation="relu"),
        keras.layers.Dense(1),
    ])

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss="mse",
    )

    # Early stopping to prevent overfitting
    early_stop = keras.callbacks.EarlyStopping(
        monitor="val_loss" if len(X_val) > 0 else "loss",
        patience=15,
        restore_best_weights=True,
    )

    # Train
    validation_data = (X_val, y_val) if len(X_val) > 0 else None
    model.fit(
        X_train, y_train,
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        validation_data=validation_data,
        callbacks=[early_stop],
        verbose=0,
    )

    # Recursive multi-step prediction
    forecast_scaled = []
    current_seq = scaled[-LOOKBACK:].copy()

    for _ in range(horizon):
        inp = current_seq.reshape(1, LOOKBACK, 1)
        pred = float(model.predict(inp, verbose=0)[0, 0])
        forecast_scaled.append(pred)
        # Shift window
        current_seq = np.append(current_seq[1:], pred)

    # Inverse transform
    forecast_vals = [max(0, float(v * data_range + data_min)) for v in forecast_scaled]

    # Confidence intervals from validation residuals
    if len(X_val) > 0:
        val_pred = model.predict(X_val, verbose=0).flatten()
        residuals = y_val - val_pred
        residual_std = float(np.std(residuals)) * data_range
    else:
        residual_std = float(np.std(series)) * 0.15

    z = 1.645
    lower = [max(0, f - z * residual_std * np.sqrt(i + 1)) for i, f in enumerate(forecast_vals)]
    upper = [f + z * residual_std * np.sqrt(i + 1) for i, f in enumerate(forecast_vals)]

    return {
        "forecast": forecast_vals,
        "lower": lower,
        "upper": upper,
        "model_name": "LSTM",
    }


def _create_sequences(data: np.ndarray, lookback: int):
    """Create input/output sequences for LSTM training."""
    X, y = [], []
    for i in range(lookback, len(data)):
        X.append(data[i - lookback:i])
        y.append(data[i])
    return np.array(X), np.array(y)


def _fallback_ets(series: list[float], horizon: int) -> dict:
    """Exponential Smoothing fallback."""
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        if len(series) < 3:
            avg = np.mean(series) if series else 0
            vals = [max(0, float(avg))] * horizon
            return {
                "forecast": vals,
                "lower": [max(0, v * 0.7) for v in vals],
                "upper": [v * 1.3 for v in vals],
                "model_name": "LSTM-Naive-Fallback",
            }

        model = ExponentialSmoothing(
            series,
            trend="add" if len(series) >= 4 else None,
            seasonal=None,
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True)
        result = fit.forecast(horizon)
        forecast_vals = [max(0, float(v)) for v in result]

        std = float(np.std(series))
        z = 1.645
        lower = [max(0, f - z * std) for f in forecast_vals]
        upper = [f + z * std for f in forecast_vals]

        return {
            "forecast": forecast_vals,
            "lower": lower,
            "upper": upper,
            "model_name": "LSTM-ETS-Fallback",
        }
    except Exception:
        avg = np.mean(series) if series else 0
        vals = [max(0, float(avg))] * horizon
        return {
            "forecast": vals,
            "lower": [max(0, v * 0.7) for v in vals],
            "upper": [v * 1.3 for v in vals],
            "model_name": "LSTM-Naive-Fallback",
        }
