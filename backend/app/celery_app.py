"""
Celery application for background tasks (forecast generation, data import).
"""
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
