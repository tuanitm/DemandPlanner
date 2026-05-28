import asyncio, os
os.environ["SAP_URL"] = "http://fake"
os.environ["SAP_USERNAME"] = "test"
os.environ["SAP_COMPANY_DB"] = "test"
os.environ["SAP_PASSWORD"] = "test"

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.database import Base
from app.services.sap_service import sap_service

async def mock_fetch(query):
    if query == "DP_GetBrands": return [{"BrandCode": "B1", "BrandName": "Brand 1"}]
    if query == "DP_GetChannels": return [{"ChannelCode": "C1", "ChannelName": "Chan 1"}]
    if query == "DP_GetRegions": return [{"RegionCode": "R1", "RegionName": "Reg 1"}]
    if query == "DP_GetWarehouses": return [{"WarehouseCode": "W1", "WarehouseName": "WHS 1", "RegionCode": "R1"}]
    if query == "DP_GetPartnerGroup": return [{"PartnerGroupCode": "PG1", "PartnerGroupName": "PG 1", "Channel": "C1", "Type": "Customer"}]
    if query == "DP_GetPartners": return [{"PartnerCode": "P1", "PartnerName": "P1", "PartnerGroupCode": "PG1"}]
    if query == "DP_GetProductGroup": return [{"ItemGroupCode": "IG1", "ItemGroupName": "IG1", "ItemCategoryCode": "IC1", "ItemCategoryName": "IC1", "Brand": "B1", "Business": "B"}]
    if query == "DP_GetItems": return [{"ItemCode": "I1", "ItemName": "I1", "ItemGroupCode": "IG1"}]
    if query == "DP_GetSales": return [{"ItemCode": "I1", "WarehouseCode": "W1", "PartnerCode": "P1", "Year": 2024, "Month": 1, "Quantity": 10, "Amount": 100}]
    return []

sap_service._fetch_query = mock_fetch
async def mock_auth(): pass
sap_service.authenticate = mock_auth
async def mock_close(): pass
sap_service.close = mock_close

async def test():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = async_sessionmaker(engine)
    async with SessionLocal() as db:
        res = await sap_service.sync_all(db)
        print("SYNC RES:", res)

asyncio.run(test())
