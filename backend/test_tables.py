import asyncio
from app.database import engine
from sqlalchemy import text

async def main():
    async with engine.begin() as conn:
        res = await conn.execute(text('SHOW TABLES'))
        print(res.fetchall())

if __name__ == "__main__":
    asyncio.run(main())
