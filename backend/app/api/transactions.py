"""
Transaction API routes: Sales, Inventory, PO, MO, Stock-In, Ad-hoc Demand.
Full CRUD + bulk create + filtering.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete
from app.database import get_db
from app.models.transactions import (
    ActualSales, InventoryOnhand, PurchaseOrder,
    ProductionOrder, StockInTransaction, DemandAdhoc
)
from app.models.forecasts import User
from app.schemas.schemas import (
    ActualSalesCreate, ActualSalesResponse,
    InventoryCreate, InventoryResponse,
    PurchaseOrderCreate, PurchaseOrderResponse,
    ProductionOrderCreate, ProductionOrderResponse,
    StockInCreate, StockInResponse,
    DemandAdhocCreate, DemandAdhocResponse,
    PaginatedResponse
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


# ══════════════════════════════════════════════
# Actual Sales
# ══════════════════════════════════════════════

@router.get("/sales", response_model=PaginatedResponse)
async def list_sales(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, warehouse_code: Optional[str] = None,
    year: Optional[int] = None, month: Optional[int] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    from app.models.master_data import Item, ProductHierarchy, Partner, PartnerGroup

    q = (
        select(
            ActualSales,
            Item.item_name,
            Item.uom.label("item_uom"),
            ProductHierarchy.brand,
            ProductHierarchy.item_group_name,
            Partner.partner_name,
            PartnerGroup.channel,
        )
        .outerjoin(Item, ActualSales.item_code == Item.item_code)
        .outerjoin(ProductHierarchy, Item.item_group_code == ProductHierarchy.item_group_code)
        .outerjoin(Partner, ActualSales.partner_code == Partner.partner_code)
        .outerjoin(PartnerGroup, Partner.partner_grp_code == PartnerGroup.partner_grp_code)
    )
    if item_code: q = q.where(ActualSales.item_code == item_code)
    if warehouse_code: q = q.where(ActualSales.warehouse_code == warehouse_code)
    if year: q = q.where(ActualSales.year == year)
    if month: q = q.where(ActualSales.month == month)
    if search: q = q.where(ActualSales.item_code.contains(search) | Item.item_name.contains(search))
    q = q.order_by(ActualSales.year.desc(), ActualSales.month.desc(), ActualSales.id.desc())

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    rows = result.all()

    items = []
    for row in rows:
        sale = row[0]
        d = ActualSalesResponse.model_validate(sale).model_dump()
        d["item_name"] = row.item_name or ""
        d["item_uom"] = row.item_uom or ""
        d["brand"] = row.brand or ""
        d["item_group_name"] = row.item_group_name or ""
        d["partner_name"] = row.partner_name or ""
        d["channel"] = str(row.channel.value) if row.channel else ""
        items.append(d)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)

@router.post("/sales", response_model=ActualSalesResponse, status_code=201)
async def create_sales(data: ActualSalesCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = ActualSales(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return ActualSalesResponse.model_validate(obj)

@router.post("/sales/bulk", response_model=dict)
async def bulk_create_sales(data: List[ActualSalesCreate], db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    objects = [ActualSales(**d.model_dump()) for d in data]
    db.add_all(objects); await db.flush()
    return {"message": f"Created {len(objects)} sales records", "count": len(objects)}

@router.delete("/sales/{id}")
async def delete_sales(id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ActualSales).where(ActualSales.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Sales record not found")
    await db.delete(obj); await db.flush()
    return {"message": "Deleted"}


# ══════════════════════════════════════════════
# Inventory On-hand
# ══════════════════════════════════════════════

@router.get("/inventory", response_model=PaginatedResponse)
async def list_inventory(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, warehouse_code: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(InventoryOnhand)
    if item_code: q = q.where(InventoryOnhand.item_code == item_code)
    if warehouse_code: q = q.where(InventoryOnhand.warehouse_code == warehouse_code)
    if search: q = q.where(InventoryOnhand.item_code.contains(search))
    q = q.order_by(InventoryOnhand.last_updated.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[InventoryResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/inventory", response_model=InventoryResponse, status_code=201)
async def create_inventory(data: InventoryCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = InventoryOnhand(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return InventoryResponse.model_validate(obj)

@router.put("/inventory/{id}", response_model=InventoryResponse)
async def update_inventory(id: int, data: InventoryCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(InventoryOnhand).where(InventoryOnhand.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Inventory record not found")
    for k, v in data.model_dump().items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return InventoryResponse.model_validate(obj)

@router.delete("/inventory/{id}")
async def delete_inventory(id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(InventoryOnhand).where(InventoryOnhand.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Inventory record not found")
    await db.delete(obj); await db.flush()
    return {"message": "Deleted"}


# ══════════════════════════════════════════════
# Purchase Orders
# ══════════════════════════════════════════════

@router.get("/purchase-orders", response_model=PaginatedResponse)
async def list_purchase_orders(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(PurchaseOrder)
    if item_code: q = q.where(PurchaseOrder.item_code == item_code)
    if status: q = q.where(PurchaseOrder.status == status)
    if search: q = q.where(PurchaseOrder.po_number.contains(search) | PurchaseOrder.item_code.contains(search))
    q = q.order_by(PurchaseOrder.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[PurchaseOrderResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/purchase-orders", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(data: PurchaseOrderCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = PurchaseOrder(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return PurchaseOrderResponse.model_validate(obj)

@router.put("/purchase-orders/{id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(id: int, data: PurchaseOrderCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseOrder).where(PurchaseOrder.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Purchase order not found")
    for k, v in data.model_dump().items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return PurchaseOrderResponse.model_validate(obj)

@router.delete("/purchase-orders/{id}")
async def delete_purchase_order(id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseOrder).where(PurchaseOrder.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Purchase order not found")
    await db.delete(obj); await db.flush()
    return {"message": "Deleted"}


# ══════════════════════════════════════════════
# Production Orders (MO)
# ══════════════════════════════════════════════

@router.get("/production-orders", response_model=PaginatedResponse)
async def list_production_orders(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(ProductionOrder)
    if item_code: q = q.where(ProductionOrder.item_code == item_code)
    if status: q = q.where(ProductionOrder.status == status)
    if search: q = q.where(ProductionOrder.mo_number.contains(search) | ProductionOrder.item_code.contains(search))
    q = q.order_by(ProductionOrder.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[ProductionOrderResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/production-orders", response_model=ProductionOrderResponse, status_code=201)
async def create_production_order(data: ProductionOrderCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = ProductionOrder(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return ProductionOrderResponse.model_validate(obj)

@router.put("/production-orders/{id}", response_model=ProductionOrderResponse)
async def update_production_order(id: int, data: ProductionOrderCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ProductionOrder).where(ProductionOrder.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Production order not found")
    for k, v in data.model_dump().items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return ProductionOrderResponse.model_validate(obj)

@router.delete("/production-orders/{id}")
async def delete_production_order(id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ProductionOrder).where(ProductionOrder.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Production order not found")
    await db.delete(obj); await db.flush()
    return {"message": "Deleted"}


# ══════════════════════════════════════════════
# Stock-In Transactions
# ══════════════════════════════════════════════

@router.get("/stock-in", response_model=PaginatedResponse)
async def list_stock_in(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, warehouse_code: Optional[str] = None,
    trans_type: Optional[str] = None, search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(StockInTransaction)
    if item_code: q = q.where(StockInTransaction.item_code == item_code)
    if warehouse_code: q = q.where(StockInTransaction.warehouse_code == warehouse_code)
    if trans_type: q = q.where(StockInTransaction.trans_type == trans_type)
    if search: q = q.where(StockInTransaction.item_code.contains(search) | StockInTransaction.reference_number.contains(search))
    q = q.order_by(StockInTransaction.trans_date.desc(), StockInTransaction.id.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[StockInResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/stock-in", response_model=StockInResponse, status_code=201)
async def create_stock_in(data: StockInCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = StockInTransaction(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return StockInResponse.model_validate(obj)

@router.delete("/stock-in/{id}")
async def delete_stock_in(id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(StockInTransaction).where(StockInTransaction.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Stock-in record not found")
    await db.delete(obj); await db.flush()
    return {"message": "Deleted"}


# ══════════════════════════════════════════════
# Ad-hoc Demand
# ══════════════════════════════════════════════

@router.get("/adhoc-demand", response_model=PaginatedResponse)
async def list_adhoc_demand(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, warehouse_code: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(DemandAdhoc)
    if item_code: q = q.where(DemandAdhoc.item_code == item_code)
    if warehouse_code: q = q.where(DemandAdhoc.warehouse_code == warehouse_code)
    if search: q = q.where(DemandAdhoc.item_code.contains(search) | DemandAdhoc.demand_source.contains(search))
    q = q.order_by(DemandAdhoc.demand_date.desc(), DemandAdhoc.id.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[DemandAdhocResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/adhoc-demand", response_model=DemandAdhocResponse, status_code=201)
async def create_adhoc_demand(data: DemandAdhocCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = DemandAdhoc(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return DemandAdhocResponse.model_validate(obj)

@router.delete("/adhoc-demand/{id}")
async def delete_adhoc_demand(id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(DemandAdhoc).where(DemandAdhoc.id == id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(404, "Ad-hoc demand record not found")
    await db.delete(obj); await db.flush()
    return {"message": "Deleted"}
