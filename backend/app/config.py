"""
Application configuration loaded from environment variables.
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "DemandPlanner"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database (defaults to SQLite for local dev; override with env vars for PostgreSQL)
    DATABASE_URL: str = "sqlite+aiosqlite:///./demandplanner.db"
    DATABASE_URL_SYNC: str = "sqlite:///./demandplanner.db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    SECRET_KEY: str = "demand-planner-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours
    ALGORITHM: str = "HS256"

    # Forecast
    FORECAST_HORIZON_MONTHS: int = 6
    SAFETY_STOCK_SERVICE_LEVEL: float = 0.95  # Z = 1.645

    # Inventory thresholds (configurable)
    SLOW_MOVING_DAYS: int = 90
    SLOW_MOVING_MIN_QTY: int = 10
    NEAR_EXPIRY_DAYS: int = 60

    # SAP B1
    SAP_B1_SERVICE_URL: Optional[str] = None
    SAP_B1_COMPANY_DB: Optional[str] = None
    SAP_B1_USERNAME: Optional[str] = None
    SAP_B1_PASSWORD: Optional[str] = None
    SAP_URL: Optional[str] = None
    SAP_COMPANY_DB: Optional[str] = None
    SAP_USERNAME: Optional[str] = None
    SAP_PASSWORD: Optional[str] = None

    # CORS
    CORS_ORIGINS: list[str] = ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
