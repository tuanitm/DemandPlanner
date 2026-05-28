import os
import sys
import httpx
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pathlib import Path

from app.models.master_data import Item, Partner, Warehouse, Brand, Channel, Region, ProductHierarchy, PartnerGroup
from app.models.transactions import ActualSales, PurchaseOrder, ProductionOrder, InventoryOnhand

logger = logging.getLogger(__name__)

# Try to import decryption logic from project root
sys.path.append(str(Path(__file__).parent.parent.parent))
try:
    from encrypt_token import decrypt_token, load_key
except ImportError:
    logger.warning("Could not import encrypt_token module")
    decrypt_token = None
    load_key = None

class SAPService:
    def __init__(self):
        self.url = os.environ.get("SAP_URL", "").rstrip("/")
        self.username = os.environ.get("SAP_USERNAME", "")
        self.company_db = os.environ.get("SAP_COMPANY_DB", "")
        self.password = ""
        self.client = None

    def _load_password(self):
        enc_password = os.environ.get("SAP_PASSWORD", "")
        if enc_password and decrypt_token and load_key:
            try:
                key = load_key()
                self.password = decrypt_token(enc_password, key)
            except Exception as e:
                logger.error(f"SAP Password decryption failed: {e}")
        else:
            self.password = enc_password

    async def authenticate(self):
        self._load_password()
        if not self.url or not self.username or not self.password:
            raise ValueError("SAP connection details are missing in .env (SAP_URL, SAP_USERNAME, SAP_PASSWORD, SAP_COMPANY_DB)")

        self.client = httpx.AsyncClient(verify=False, timeout=120.0)
        login_data = {
            "CompanyDB": self.company_db,
            "UserName": self.username,
            "Password": self.password
        }
        res = await self.client.post(f"{self.url}/b1s/v1/Login", json=login_data)
        if res.status_code != 200:
            raise ValueError(f"SAP Login failed: {res.text}")

    async def close(self):
        if self.client:
            try:
                await self.client.post(f"{self.url}/b1s/v1/Logout")
            except Exception:
                pass
            await self.client.aclose()

    async def _fetch_query(self, query_name: str) -> list:
        """Helper to fetch data from a defined SQL Query in B1 Service Layer."""
        res = await self.client.get(f"{self.url}/b1s/v1/SQLQueries('{query_name}')/List")
        if res.status_code == 200:
            return res.json().get('value', [])
        else:
            logger.warning(f"Query {query_name} failed: {res.text}")
            return []

    # ──────────────────────────────────────────────
    # MASTER DATA SYNC
    # ──────────────────────────────────────────────

    async def sync_brands(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetBrands')
        for row in data:
            code = row.get('BrandCode')
            if not code: continue
            q = await db.execute(select(Brand).where(Brand.brand_code == code))
            obj = q.scalar_one_or_none()
            if obj:
                obj.brand_name = row.get('BrandName', obj.brand_name)
            else:
                db.add(Brand(brand_code=code, brand_name=row.get('BrandName', code), status='Active'))
        return len(data)

    async def sync_channels(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetChannels')
        for row in data:
            code = row.get('ChannelCode')
            if not code: continue
            q = await db.execute(select(Channel).where(Channel.channel_code == code))
            obj = q.scalar_one_or_none()
            if obj:
                obj.channel_name = row.get('ChannelName', obj.channel_name)
            else:
                db.add(Channel(channel_code=code, channel_name=row.get('ChannelName', code), status='Active'))
        return len(data)

    async def sync_regions(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetRegions')
        for row in data:
            code = row.get('RegionCode')
            if not code: continue
            q = await db.execute(select(Region).where(Region.region_code == code))
            obj = q.scalar_one_or_none()
            if obj:
                obj.region_name = row.get('RegionName', obj.region_name)
            else:
                db.add(Region(region_code=code, region_name=row.get('RegionName', code), status='Active'))
        return len(data)

    async def sync_warehouses(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetWarehouses')
        for row in data:
            code = row.get('WarehouseCode')
            if not code: continue
            q = await db.execute(select(Warehouse).where(Warehouse.warehouse_code == code))
            obj = q.scalar_one_or_none()
            if obj:
                obj.warehouse_name = row.get('WarehouseName', obj.warehouse_name)
                obj.warehouse_region = row.get('RegionCode', obj.warehouse_region)
            else:
                db.add(Warehouse(
                    warehouse_code=code, 
                    warehouse_name=row.get('WarehouseName', code), 
                    warehouse_region=row.get('RegionCode', 'HQ'),
                    warehouse_status='Active'
                ))
        return len(data)

    async def sync_partner_groups(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetPartnerGroup')
        for row in data:
            code = row.get('PartnerGroupCode')
            if not code: continue
            q = await db.execute(select(PartnerGroup).where(PartnerGroup.partner_grp_code == code))
            obj = q.scalar_one_or_none()
            if obj:
                obj.partner_grp_name = row.get('PartnerGroupName', obj.partner_grp_name)
                obj.channel = row.get('Channel', obj.channel)
                obj.partner_grp_type = row.get('Type', obj.partner_grp_type)
            else:
                db.add(PartnerGroup(
                    partner_grp_code=code,
                    partner_grp_name=row.get('PartnerGroupName', code),
                    channel=row.get('Channel', 'General Trade'),
                    partner_grp_type=row.get('Type', 'Customer'),
                    status='Active'
                ))
        return len(data)

    async def sync_business_partners(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetPartners')
        for row in data:
            code = row.get('PartnerCode')
            if not code: continue
            q = await db.execute(select(Partner).where(Partner.partner_code == code))
            obj = q.scalar_one_or_none()
            if obj:
                obj.partner_name = row.get('PartnerName', obj.partner_name)
                obj.partner_grp_code = row.get('PartnerGroupCode', obj.partner_grp_code)
            else:
                db.add(Partner(
                    partner_code=code, 
                    partner_name=row.get('PartnerName', code),
                    partner_grp_code=row.get('PartnerGroupCode', 'DEFAULT'),
                    status='Active'
                ))
        return len(data)

    async def sync_product_groups(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetProductGroup')
        for row in data:
            code = row.get('ItemGroupCode')
            if not code: continue
            q = await db.execute(select(ProductHierarchy).where(ProductHierarchy.item_group_code == code))
            obj = q.scalar_one_or_none()
            if obj:
                obj.item_group_name = row.get('ItemGroupName', obj.item_group_name)
                obj.item_category_code = row.get('ItemCategoryCode', obj.item_category_code)
                obj.item_category_name = row.get('ItemCategoryName', obj.item_category_name)
                obj.brand = row.get('Brand', obj.brand)
                obj.business = row.get('Business', obj.business)
            else:
                db.add(ProductHierarchy(
                    item_group_code=code,
                    item_group_name=row.get('ItemGroupName', code),
                    item_category_code=row.get('ItemCategoryCode', code),
                    item_category_name=row.get('ItemCategoryName', code),
                    brand=row.get('Brand', 'DEFAULT'),
                    business=row.get('Business', 'DEFAULT'),
                    status='Active'
                ))
        return len(data)

    async def sync_items(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetItems')
        for row in data:
            code = row.get('ItemCode')
            if not code: continue
            q = await db.execute(select(Item).where(Item.item_code == code))
            obj = q.scalar_one_or_none()
            if obj:
                obj.item_name = row.get('ItemName', obj.item_name)
                obj.uom = row.get('UOM', obj.uom)
                obj.item_group_code = row.get('ItemGroupCode', obj.item_group_code)
            else:
                db.add(Item(
                    item_code=code, 
                    item_name=row.get('ItemName', code),
                    uom=row.get('UOM', 'PCS'),
                    item_group_code=row.get('ItemGroupCode', 'DEFAULT'),
                    item_type='Finished Goods',
                    status='Active'
                ))
        return len(data)

    # ──────────────────────────────────────────────
    # TRANSACTIONS SYNC
    # ──────────────────────────────────────────────

    async def sync_sales(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetSales')
        for row in data:
            item_code = row.get('ItemCode')
            whs_code = row.get('WarehouseCode')
            partner_code = row.get('PartnerCode')
            year = row.get('Year')
            month = row.get('Month')
            qty = row.get('Quantity', 0)
            amount = row.get('Amount', 0)
            
            if not item_code or not year or not month or qty <= 0: continue
            
            q = await db.execute(
                select(ActualSales).where(
                    ActualSales.year == year,
                    ActualSales.month == month,
                    ActualSales.item_code == item_code,
                    ActualSales.warehouse_code == whs_code,
                    ActualSales.partner_code == partner_code,
                    ActualSales.source == 'SAP'
                )
            )
            sale = q.scalar_one_or_none()
            if sale:
                sale.quantity = float(qty)
                sale.amount = float(amount)
            else:
                sale = ActualSales(
                    item_code=item_code, warehouse_code=whs_code, partner_code=partner_code,
                    year=int(year), month=int(month), quantity=float(qty), amount=float(amount), source='SAP'
                )
                db.add(sale)
        return len(data)

    async def sync_purchase_orders(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetPOs')
        for row in data:
            po_num = str(row.get('PONumber', ''))
            item_code = row.get('ItemCode')
            
            if not po_num or not item_code: continue
            
            q = await db.execute(
                select(PurchaseOrder).where(PurchaseOrder.po_number == po_num, PurchaseOrder.item_code == item_code)
            )
            order = q.scalar_one_or_none()
            if order:
                order.quantity = float(row.get('Quantity', order.quantity))
                order.unit_price = float(row.get('UnitPrice', order.unit_price))
                order.status = row.get('Status', order.status)
            else:
                db.add(PurchaseOrder(
                    po_number=po_num, item_code=item_code, partner_code=row.get('PartnerCode'),
                    quantity=float(row.get('Quantity', 0)), unit_price=float(row.get('UnitPrice', 0)),
                    currency=row.get('Currency', 'VND'), status=row.get('Status', 'In Progress'), source='SAP'
                ))
        return len(data)

    async def sync_production_orders(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetMOs')
        for row in data:
            mo_num = str(row.get('MONumber', ''))
            item_code = row.get('ItemCode')
            
            if not mo_num or not item_code: continue
            
            q = await db.execute(
                select(ProductionOrder).where(ProductionOrder.mo_number == mo_num, ProductionOrder.item_code == item_code)
            )
            order = q.scalar_one_or_none()
            if order:
                order.quantity = float(row.get('Quantity', order.quantity))
                order.status = row.get('Status', order.status)
            else:
                db.add(ProductionOrder(
                    mo_number=mo_num, item_code=item_code, warehouse_code=row.get('WarehouseCode'),
                    quantity=float(row.get('Quantity', 0)), status=row.get('Status', 'In Progress'), source='SAP'
                ))
        return len(data)

    async def sync_inventory(self, db: AsyncSession):
        data = await self._fetch_query('DP_GetInventoryOnhand')
        for row in data:
            item_code = row.get('ItemCode')
            whs_code = row.get('WarehouseCode')
            
            if not item_code or not whs_code: continue
            
            q = await db.execute(
                select(InventoryOnhand).where(InventoryOnhand.item_code == item_code, InventoryOnhand.warehouse_code == whs_code)
            )
            inv = q.scalar_one_or_none()
            if inv:
                inv.quantity = float(row.get('Quantity', inv.quantity))
                inv.unit_cost = float(row.get('UnitCost', inv.unit_cost))
                inv.batch_number = row.get('BatchNumber', inv.batch_number)
                inv.last_updated = datetime.utcnow()
            else:
                db.add(InventoryOnhand(
                    item_code=item_code, warehouse_code=whs_code,
                    quantity=float(row.get('Quantity', 0)), unit_cost=float(row.get('UnitCost', 0)),
                    batch_number=row.get('BatchNumber')
                ))
        return len(data)

    async def sync_all(self, db: AsyncSession):
        if not self.url:
            return {"message": "Simulated SAP Sync successful. (No SAP_URL in .env)"}

        await self.authenticate()
        try:
            # Sync Master Data first to prevent foreign key errors
            counts = {}
            counts['Brands'] = await self.sync_brands(db)
            counts['Channels'] = await self.sync_channels(db)
            counts['Regions'] = await self.sync_regions(db)
            counts['Warehouses'] = await self.sync_warehouses(db)
            counts['PartnerGroups'] = await self.sync_partner_groups(db)
            counts['Partners'] = await self.sync_business_partners(db)
            counts['ProductGroups'] = await self.sync_product_groups(db)
            counts['Items'] = await self.sync_items(db)
            await db.flush()
            
            # Sync Transactions
            counts['Sales'] = await self.sync_sales(db)
            counts['POs'] = await self.sync_purchase_orders(db)
            counts['MOs'] = await self.sync_production_orders(db)
            counts['Inventory'] = await self.sync_inventory(db)
            
            await db.flush()
            
            return {
                "message": f"SAP Sync Complete. Fetched {sum(counts.values())} records total.",
                "details": counts
            }
        except Exception as e:
            logger.error(f"SAP Sync Error: {e}")
            raise e
        finally:
            await self.close()

sap_service = SAPService()
