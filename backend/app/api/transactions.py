"""
Transaction API routes: Sales, Inventory, PO, MO data entry.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.transactions import ActualSales, InventoryOnhand, PurchaseOrder, ProductionOrder
from app.models.forecasts import User
from app.schemas.schemas import (
    ActualSalesCreate, ActualSalesResponse,
    InventoryCreate, InventoryResponse,
    PurchaseOrderCreate, PurchaseOrderResponse,
    ProductionOrderCreate, ProductionOrderResponse,
    PaginatedResponse
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


# ── Actual Sales ──

@router.get("/sales", response_model=PaginatedResponse)
async def list_sales(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, warehouse_code: Optional[str] = None,
    year: Optional[int] = None, month: Optional[int] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(ActualSales)
    if item_code: q = q.where(ActualSales.item_code == item_code)
    if warehouse_code: q = q.where(ActualSales.warehouse_code == warehouse_code)
    if year: q = q.where(ActualSales.year == year)
    if month: q = q.where(ActualSales.month == month)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[ActualSalesResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/sales", response_model=ActualSalesResponse, status_code=201)
async def create_sales(data: ActualSalesCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = ActualSales(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return ActualSalesResponse.model_validate(obj)

@router.post("/sales/bulk", response_model=dict)
async def bulk_create_sales(data: List[ActualSalesCreate], db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    objects = [ActualSales(**d.model_dump()) for d in data]
    db.add_all(objects); await db.flush()
    return {"message": f"Created {len(objects)} sales records"}


# ── Inventory ──

@router.get("/inventory", response_model=PaginatedResponse)
async def list_inventory(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, warehouse_code: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(InventoryOnhand)
    if item_code: q = q.where(InventoryOnhand.item_code == item_code)
    if warehouse_code: q = q.where(InventoryOnhand.warehouse_code == warehouse_code)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[InventoryResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/inventory", response_model=InventoryResponse, status_code=201)
async def create_inventory(data: InventoryCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = InventoryOnhand(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return InventoryResponse.model_validate(obj)


# ── Purchase Orders ──

@router.get("/purchase-orders", response_model=PaginatedResponse)
async def list_purchase_orders(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, status: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(PurchaseOrder)
    if item_code: q = q.where(PurchaseOrder.item_code == item_code)
    if status: q = q.where(PurchaseOrder.status == status)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[PurchaseOrderResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/purchase-orders", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(data: PurchaseOrderCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = PurchaseOrder(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return PurchaseOrderResponse.model_validate(obj)


# ── Production Orders ──

@router.get("/production-orders", response_model=PaginatedResponse)
async def list_production_orders(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None, status: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(ProductionOrder)
    if item_code: q = q.where(ProductionOrder.item_code == item_code)
    if status: q = q.where(ProductionOrder.status == status)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[ProductionOrderResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/production-orders", response_model=ProductionOrderResponse, status_code=201)
async def create_production_order(data: ProductionOrderCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = ProductionOrder(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return ProductionOrderResponse.model_validate(obj)
