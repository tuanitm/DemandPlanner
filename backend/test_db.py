import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings
from app.database import engine

async def test_conn():
    print(f"Testing connection to {settings.DATABASE_URL}")
    try:
        async with engine.begin() as conn:
            print("Successfully connected!")
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    asyncio.run(test_conn())
