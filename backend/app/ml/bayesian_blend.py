"""
Bayesian Model Averaging — assigns posterior probability weights to each model.

Instead of fixed ensemble weights, BMA uses model evidence (marginal likelihood)
to compute posterior model probabilities. Models with better predictive accuracy
on held-out validation data receive higher weights.

When PyMC is not available, falls back to inverse-error weighting which
approximates Bayesian model probabilities using validation RMSE.
"""
import logging
import warnings

import numpy as np

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

# Minimum validation points for meaningful weight estimation
MIN_VAL_POINTS = 3


def compute_model_weights(
    model_predictions: dict[str, list[float]],
    actuals: list[float],
) -> dict[str, float]:
    """
    Compute Bayesian posterior model weights from validation predictions.

    Uses inverse-error weighting as a practical approximation of BMA:
    weight_i ∝ exp(-0.5 * n * log(MSE_i))

    This is equivalent to the BIC-based Bayesian model probability under
    the assumption of Gaussian errors.

    Args:
        model_predictions: dict of model_name → list of predicted values.
        actuals: actual values for the validation period.

    Returns:
        dict of model_name → weight (sums to 1.0).
    """
    if not model_predictions or not actuals:
        # Equal weights
        n_models = len(model_predictions) if model_predictions else 1
        return {k: 1.0 / n_models for k in (model_predictions or {"default": 0})}

    actuals_arr = np.array(actuals, dtype=np.float64)
    n = len(actuals_arr)

    log_likelihoods = {}

    for model_name, preds in model_predictions.items():
        pred_arr = np.array(preds[:n], dtype=np.float64)
        if len(pred_arr) < n:
            # Pad with last value if predictions are shorter
            pred_arr = np.pad(pred_arr, (0, n - len(pred_arr)), mode="edge")

        # Mean Squared Error
        mse = float(np.mean((actuals_arr - pred_arr) ** 2))
        # Prevent log(0) by adding small epsilon
        mse = max(mse, 1e-10)

        # Log marginal likelihood approximation (BIC-like):
        # log P(D|M_i) ≈ -n/2 * log(MSE_i)
        log_likelihoods[model_name] = -0.5 * n * np.log(mse)

    # Convert to posterior probabilities via softmax
    max_ll = max(log_likelihoods.values())
    exp_ll = {k: np.exp(v - max_ll) for k, v in log_likelihoods.items()}
    total = sum(exp_ll.values())

    weights = {k: float(v / total) for k, v in exp_ll.items()}

    logger.info(f"BMA weights: {weights}")
    return weights


def compute_weights_pymc(
    model_predictions: dict[str, list[float]],
    actuals: list[float],
) -> dict[str, float]:
    """
    Compute model weights using PyMC for full Bayesian inference.

    Uses a Dirichlet prior over model weights and a Gaussian likelihood
    to estimate posterior model probabilities via MCMC sampling.

    Falls back to inverse-error weighting if PyMC fails.
    """
    try:
        import pymc as pm
        import arviz as az
    except ImportError:
        logger.info("PyMC not available, using inverse-error BMA")
        return compute_model_weights(model_predictions, actuals)

    if len(actuals) < MIN_VAL_POINTS:
        return compute_model_weights(model_predictions, actuals)

    try:
        model_names = list(model_predictions.keys())
        n_models = len(model_names)
        n = len(actuals)

        # Stack predictions: shape (n_models, n_points)
        pred_matrix = np.array([
            model_predictions[name][:n] for name in model_names
        ], dtype=np.float64)
        actuals_arr = np.array(actuals, dtype=np.float64)

        with pm.Model() as bma_model:
            # Dirichlet prior for model weights (uniform)
            weights = pm.Dirichlet("weights", a=np.ones(n_models))

            # Blended prediction = weighted sum of model predictions
            blended = pm.math.dot(weights, pred_matrix)

            # Noise standard deviation
            sigma = pm.HalfNormal("sigma", sigma=float(np.std(actuals_arr)))

            # Likelihood
            pm.Normal("obs", mu=blended, sigma=sigma, observed=actuals_arr)

            # Sample
            trace = pm.sample(
                draws=1000,
                tune=500,
                cores=1,
                chains=2,
                return_inferencedata=True,
                progressbar=False,
            )

        # Extract posterior mean weights
        weight_samples = trace.posterior["weights"].values
        mean_weights = weight_samples.mean(axis=(0, 1))

        result = {name: float(w) for name, w in zip(model_names, mean_weights)}
        # Normalize
        total = sum(result.values())
        result = {k: v / total for k, v in result.items()}

        logger.info(f"PyMC BMA weights: {result}")
        return result

    except Exception as e:
        logger.warning(f"PyMC BMA failed: {e}, falling back to inverse-error")
        return compute_model_weights(model_predictions, actuals)


def blend_forecasts(
    model_forecasts: dict[str, dict],
    weights: dict[str, float],
) -> dict:
    """
    Blend multiple model forecasts using computed weights.

    Args:
        model_forecasts: dict of model_name → forecast dict
            (each has 'forecast', 'lower', 'upper' keys).
        weights: dict of model_name → weight.

    Returns:
        Blended forecast dict with 'forecast', 'lower', 'upper', 'model_name'.
    """
    if not model_forecasts:
        return {"forecast": [], "lower": [], "upper": [], "model_name": "BMA-Empty"}

    # Get forecast length from first model
    first = next(iter(model_forecasts.values()))
    horizon = len(first["forecast"])

    blended_forecast = np.zeros(horizon)
    blended_lower = np.zeros(horizon)
    blended_upper = np.zeros(horizon)

    for model_name, fdata in model_forecasts.items():
        w = weights.get(model_name, 0)
        if w <= 0:
            continue

        forecast_arr = np.array(fdata["forecast"][:horizon])
        lower_arr = np.array(fdata["lower"][:horizon])
        upper_arr = np.array(fdata["upper"][:horizon])

        # Pad if shorter
        if len(forecast_arr) < horizon:
            forecast_arr = np.pad(forecast_arr, (0, horizon - len(forecast_arr)), mode="edge")
            lower_arr = np.pad(lower_arr, (0, horizon - len(lower_arr)), mode="edge")
            upper_arr = np.pad(upper_arr, (0, horizon - len(upper_arr)), mode="edge")

        blended_forecast += w * forecast_arr
        blended_lower += w * lower_arr
        blended_upper += w * upper_arr

    return {
        "forecast": [max(0, float(v)) for v in blended_forecast],
        "lower": [max(0, float(v)) for v in blended_lower],
        "upper": [max(0, float(v)) for v in blended_upper],
        "model_name": "Bayesian-Blend",
    }
