"""
Celery tasks for background forecast generation and supply planning.

Tasks:
  - run_forecast_task: Generate forecasts for specified items/warehouses
  - run_supply_plan_task: Generate supply recommendations
  - run_full_pipeline_task: Run forecast + supply planning end-to-end

These tasks run asynchronously in the Celery worker, allowing the API
to return immediately while heavy ML computation runs in the background.
"""
import logging
import asyncio
from typing import Optional

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_event_loop():
    """Get or create an event loop for running async code in Celery."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("Loop is closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop


async def _run_forecast_async(
    item_codes: Optional[list[str]] = None,
    warehouse_codes: Optional[list[str]] = None,
    horizon: int = 6,
) -> dict:
    """Async forecast generation for use within Celery task."""
    from app.database import async_session_factory
    from app.ml.forecast_engine import generate_forecasts

    async with async_session_factory() as db:
        try:
            result = await generate_forecasts(
                db,
                item_codes=item_codes,
                warehouse_codes=warehouse_codes,
                horizon=horizon,
            )
            await db.commit()
            return result
        except Exception as e:
            await db.rollback()
            logger.error(f"Forecast generation failed: {e}")
            raise


async def _run_supply_plan_async(
    item_codes: Optional[list[str]] = None,
    warehouse_codes: Optional[list[str]] = None,
) -> dict:
    """Async supply planning for use within Celery task."""
    from app.database import async_session_factory
    from app.ml.supply_planner import generate_recommendations

    async with async_session_factory() as db:
        try:
            result = await generate_recommendations(
                db,
                item_codes=item_codes,
                warehouse_codes=warehouse_codes,
            )
            await db.commit()
            return result
        except Exception as e:
            await db.rollback()
            logger.error(f"Supply planning failed: {e}")
            raise


@celery_app.task(
    name="forecast.generate",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def run_forecast_task(
    self,
    item_codes: Optional[list[str]] = None,
    warehouse_codes: Optional[list[str]] = None,
    horizon: int = 6,
) -> dict:
    """
    Celery task: Generate forecasts.

    Usage:
        from app.services.tasks import run_forecast_task
        result = run_forecast_task.delay(item_codes=["SKU-001"], horizon=6)
        # Check status: result.status, result.result
    """
    logger.info(
        f"Starting forecast task: items={item_codes}, "
        f"warehouses={warehouse_codes}, horizon={horizon}"
    )
    try:
        loop = _get_event_loop()
        result = loop.run_until_complete(
            _run_forecast_async(item_codes, warehouse_codes, horizon)
        )
        logger.info(f"Forecast task completed: {result.get('message', '')}")
        return result
    except Exception as exc:
        logger.error(f"Forecast task failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="supply.plan",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def run_supply_plan_task(
    self,
    item_codes: Optional[list[str]] = None,
    warehouse_codes: Optional[list[str]] = None,
) -> dict:
    """
    Celery task: Generate supply recommendations.

    Requires forecasts to exist first (run_forecast_task).
    """
    logger.info(f"Starting supply plan task: items={item_codes}, warehouses={warehouse_codes}")
    try:
        loop = _get_event_loop()
        result = loop.run_until_complete(
            _run_supply_plan_async(item_codes, warehouse_codes)
        )
        logger.info(f"Supply plan task completed: {result.get('message', '')}")
        return result
    except Exception as exc:
        logger.error(f"Supply plan task failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="pipeline.full",
    bind=True,
    max_retries=1,
    default_retry_delay=120,
    acks_late=True,
    time_limit=7200,  # 2 hours max for full pipeline
)
def run_full_pipeline_task(
    self,
    item_codes: Optional[list[str]] = None,
    warehouse_codes: Optional[list[str]] = None,
    horizon: int = 6,
) -> dict:
    """
    Celery task: Run the full forecast + supply planning pipeline.

    This is the main entry point for scheduled (weekly) or on-demand runs.
    """
    logger.info("Starting full pipeline task")
    try:
        loop = _get_event_loop()

        # Step 1: Generate forecasts
        forecast_result = loop.run_until_complete(
            _run_forecast_async(item_codes, warehouse_codes, horizon)
        )
        logger.info(f"Forecasts generated: {forecast_result.get('forecast_count', 0)}")

        # Step 2: Generate supply recommendations
        supply_result = loop.run_until_complete(
            _run_supply_plan_async(item_codes, warehouse_codes)
        )
        logger.info(f"Recommendations generated: {supply_result.get('count', 0)}")

        return {
            "message": "Full pipeline completed successfully",
            "forecast": forecast_result,
            "supply": supply_result,
        }
    except Exception as exc:
        logger.error(f"Full pipeline task failed: {exc}")
        raise self.retry(exc=exc)


# ── Periodic task schedule (optional, activated via Celery Beat) ──
celery_app.conf.beat_schedule = {
    "weekly-forecast-pipeline": {
        "task": "pipeline.full",
        "schedule": 604800.0,  # Every 7 days in seconds
        "args": (None, None, 6),
        "options": {"queue": "forecast"},
    },
}
