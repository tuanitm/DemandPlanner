"""
FastAPI application entry point.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine, Base, async_session_factory
from app.models.master_data import *  # noqa: F401,F403
from app.models.transactions import *  # noqa: F401,F403
from app.models.forecasts import *  # noqa: F401,F403
from app.models.forecast_audit import *  # noqa: F401,F403
from app.api import (
    auth, master_data, transactions, import_export, sap, forecast_api, dashboard
)
from app.services.auth_service import hash_password


async def seed_admin(session):
    """Create default admin user if not exists."""
    from app.models.forecasts import User as UserModel
    result = await session.execute(
        text("SELECT id FROM users WHERE username = 'admin'")
    )
    if not result.scalar_one_or_none():
        admin = UserModel(
            username="admin",
            email="admin@demandplanner.local",
            hashed_password=hash_password("admin123"),
            full_name="System Administrator",
            role="Admin",
        )
        session.add(admin)
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup, seed admin user."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        await seed_admin(session)

    yield

    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-Powered Demand Forecasting & Supply Planning System",
    lifespan=lifespan,
)

# CORS - allow all origins for network access
if settings.CORS_ORIGINS == ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Register routes
app.include_router(auth.router)
app.include_router(master_data.router)
app.include_router(transactions.router)
app.include_router(import_export.router)
app.include_router(sap.router)
app.include_router(forecast_api.router)
app.include_router(dashboard.router)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}
