"""
Database connection and session management.
Supports both PostgreSQL (production) and SQLite (local dev).
"""
import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from app.config import settings

# SQLite doesn't support pool_size / max_overflow / pool_pre_ping
is_sqlite = settings.DATABASE_URL.startswith("sqlite")

db_url = settings.DATABASE_URL
if is_sqlite:
    # Convert relative path to absolute based on backend directory
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_file = settings.DATABASE_URL.split("///")[-1]
    abs_db_path = os.path.join(backend_dir, db_file)
    db_url = f"sqlite+aiosqlite:///{abs_db_path}"

engine_kwargs = {
    "echo": settings.DEBUG,
}
if not is_sqlite:
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
    })

engine = create_async_engine(db_url, **engine_kwargs)

# Enable WAL mode for SQLite to allow concurrent reads/writes
if is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Dependency for FastAPI routes to get a database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
