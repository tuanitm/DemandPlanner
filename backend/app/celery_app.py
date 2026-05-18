"""
Celery application for background tasks (forecast generation, data import).

Gracefully handles missing Celery package for local development without Redis.
"""
import logging

logger = logging.getLogger(__name__)

try:
    from celery import Celery
    from app.config import settings

    celery_app = Celery(
        "demandplanner",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
    )

    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="Asia/Ho_Chi_Minh",
        enable_utc=True,
        task_track_started=True,
        task_time_limit=3600,  # 1 hour max per task
        worker_max_tasks_per_child=50,
    )

    CELERY_AVAILABLE = True

except ImportError:
    logger.warning("Celery not installed. Background tasks will not be available.")

    class _FakeCelery:
        """Stub for when Celery is not installed."""
        class conf:
            beat_schedule = {}
        def task(self, *args, **kwargs):
            def decorator(func):
                func.delay = lambda *a, **kw: None
                func.apply_async = lambda *a, **kw: None
                return func
            return decorator
        class AsyncResult:
            def __init__(self, task_id):
                self.status = "UNAVAILABLE"
                self.result = None
            def ready(self):
                return False
            def failed(self):
                return False

    celery_app = _FakeCelery()
    CELERY_AVAILABLE = False
