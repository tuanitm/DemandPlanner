"""
Master Data API routes: CRUD for Partners, Products, Items, Warehouses, BOM, Exchange Rates.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.master_data import (
    PartnerGroup, Partner, ProductHierarchy, Item,
    BillOfMaterial, Warehouse, ExchangeRate
)
from app.models.transactions import (
    ActualSales, InventoryOnhand, PurchaseOrder, ProductionOrder,
    StockInTransaction, DemandAdhoc
)
from app.models.forecasts import User, ForecastResult, SupplyRecommendation
from app.schemas.schemas import (
    PartnerGroupCreate, PartnerGroupUpdate, PartnerGroupResponse,
    PartnerCreate, PartnerUpdate, PartnerResponse,
    ProductHierarchyCreate, ProductHierarchyUpdate, ProductHierarchyResponse,
    ItemCreate, ItemUpdate, ItemResponse,
    BOMCreate, BOMResponse,
    WarehouseCreate, WarehouseUpdate, WarehouseResponse,
    ExchangeRateCreate, ExchangeRateResponse,
    PaginatedResponse, MessageResponse
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/master-data", tags=["Master Data"])


# â”€â”€ Partner Groups â”€â”€

@router.get("/partner-groups", response_model=PaginatedResponse)
async def list_partner_groups(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None, db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(PartnerGroup)
    if search:
        q = q.where(PartnerGroup.partner_grp_name.ilike(f"%{search}%") | PartnerGroup.partner_grp_code.ilike(f"%{search}%"))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[PartnerGroupResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/partner-groups", response_model=PartnerGroupResponse, status_code=201)
async def create_partner_group(data: PartnerGroupCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = PartnerGroup(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return PartnerGroupResponse.model_validate(obj)

@router.put("/partner-groups/{code}", response_model=PartnerGroupResponse)
async def update_partner_group(code: str, data: PartnerGroupUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(PartnerGroup).where(PartnerGroup.partner_grp_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return PartnerGroupResponse.model_validate(obj)

@router.delete("/partner-groups/{code}", response_model=MessageResponse)
async def delete_partner_group(code: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(PartnerGroup).where(PartnerGroup.partner_grp_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    
    # Data Integrity Check
    count = (await db.execute(select(func.count()).select_from(Partner).where(Partner.partner_grp_code == code))).scalar()
    if count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete partner group because it contains child partners.")
        
    await db.delete(obj)
    return MessageResponse(message="Deleted")


# â”€â”€ Partners â”€â”€

@router.get("/partners", response_model=PaginatedResponse)
async def list_partners(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None, group_code: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(Partner)
    if search: q = q.where(Partner.partner_name.ilike(f"%{search}%") | Partner.partner_code.ilike(f"%{search}%"))
    if group_code: q = q.where(Partner.partner_grp_code == group_code)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[PartnerResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/partners", response_model=PartnerResponse, status_code=201)
async def create_partner(data: PartnerCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = Partner(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return PartnerResponse.model_validate(obj)

@router.put("/partners/{code}", response_model=PartnerResponse)
async def update_partner(code: str, data: PartnerUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Partner).where(Partner.partner_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return PartnerResponse.model_validate(obj)

@router.delete("/partners/{code}", response_model=MessageResponse)
async def delete_partner(code: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Partner).where(Partner.partner_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    
    # Data Integrity Check
    sales_count = (await db.execute(select(func.count()).select_from(ActualSales).where(ActualSales.partner_code == code))).scalar()
    po_count = (await db.execute(select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.partner_code == code))).scalar()
    if sales_count > 0 or po_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete partner because it has associated transactions.")
        
    await db.delete(obj)
    return MessageResponse(message="Deleted")


# â”€â”€ Product Hierarchy â”€â”€

@router.get("/product-hierarchy", response_model=PaginatedResponse)
async def list_product_hierarchy(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=10000),
    search: Optional[str] = None, business: Optional[str] = None, brand: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(ProductHierarchy)
    if search: q = q.where(ProductHierarchy.item_group_name.ilike(f"%{search}%") | ProductHierarchy.item_group_code.ilike(f"%{search}%"))
    if business: q = q.where(ProductHierarchy.business == business)
    if brand: q = q.where(ProductHierarchy.brand == brand)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[ProductHierarchyResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/product-hierarchy", response_model=ProductHierarchyResponse, status_code=201)
async def create_product_hierarchy(data: ProductHierarchyCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = ProductHierarchy(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return ProductHierarchyResponse.model_validate(obj)

@router.put("/product-hierarchy/{code}", response_model=ProductHierarchyResponse)
async def update_product_hierarchy(code: str, data: ProductHierarchyUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ProductHierarchy).where(ProductHierarchy.item_group_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return ProductHierarchyResponse.model_validate(obj)

@router.delete("/product-hierarchy/{code}", response_model=MessageResponse)
async def delete_product_hierarchy(code: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ProductHierarchy).where(ProductHierarchy.item_group_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    
    # Data Integrity Check
    count = (await db.execute(select(func.count()).select_from(Item).where(Item.item_group_code == code))).scalar()
    if count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete item group because it contains child items.")
        
    await db.delete(obj)
    return MessageResponse(message="Deleted")


# â”€â”€ Items â”€â”€

@router.get("/items", response_model=PaginatedResponse)
async def list_items(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=500),
    search: Optional[str] = None, item_type: Optional[str] = None, group_code: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(Item)
    if search: q = q.where(Item.item_name.ilike(f"%{search}%") | Item.item_code.ilike(f"%{search}%"))
    if item_type: q = q.where(Item.item_type == item_type)
    if group_code: q = q.where(Item.item_group_code == group_code)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[ItemResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/items", response_model=ItemResponse, status_code=201)
async def create_item(data: ItemCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = Item(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return ItemResponse.model_validate(obj)

@router.put("/items/{code}", response_model=ItemResponse)
async def update_item(code: str, data: ItemUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Item).where(Item.item_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return ItemResponse.model_validate(obj)

@router.delete("/items/{code}", response_model=MessageResponse)
async def delete_item(code: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Item).where(Item.item_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    
    # Data Integrity Check
    for model in [ActualSales, InventoryOnhand, PurchaseOrder, ProductionOrder, StockInTransaction, DemandAdhoc]:
        count = (await db.execute(select(func.count()).select_from(model).where(model.item_code == code))).scalar()
        if count > 0:
            raise HTTPException(status_code=400, detail="Cannot delete item because it has associated transactions or inventory.")
            
    bom_fg = (await db.execute(select(func.count()).select_from(BillOfMaterial).where(BillOfMaterial.finished_goods_item_code == code))).scalar()
    bom_rm = (await db.execute(select(func.count()).select_from(BillOfMaterial).where(BillOfMaterial.raw_material_item_code == code))).scalar()
    if bom_fg > 0 or bom_rm > 0:
        raise HTTPException(status_code=400, detail="Cannot delete item because it is part of a Bill of Materials.")
        
    await db.delete(obj)
    return MessageResponse(message="Deleted")


# â”€â”€ BOM â”€â”€

@router.get("/bom/{fg_item_code}", response_model=List[BOMResponse])
async def get_bom(fg_item_code: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(BillOfMaterial).where(BillOfMaterial.finished_goods_item_code == fg_item_code))
    return [BOMResponse.model_validate(r) for r in result.scalars().all()]

@router.post("/bom", response_model=BOMResponse, status_code=201)
async def create_bom(data: BOMCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = BillOfMaterial(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return BOMResponse.model_validate(obj)

@router.post("/bom/bulk", response_model=List[BOMResponse], status_code=201)
async def create_bom_bulk(data: List[BOMCreate], db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    results = []
    for entry in data:
        obj = BillOfMaterial(**entry.model_dump())
        db.add(obj)
        await db.flush()
        await db.refresh(obj)
        results.append(BOMResponse.model_validate(obj))
    return results

@router.delete("/bom/{bom_id}", response_model=MessageResponse)
async def delete_bom(bom_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(BillOfMaterial).where(BillOfMaterial.id == bom_id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    await db.delete(obj)
    return MessageResponse(message="Deleted")


# â”€â”€ Warehouses â”€â”€

@router.get("/warehouses", response_model=PaginatedResponse)
async def list_warehouses(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None, region: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = select(Warehouse)
    if search: q = q.where(Warehouse.warehouse_name.ilike(f"%{search}%") | Warehouse.warehouse_code.ilike(f"%{search}%"))
    if region: q = q.where(Warehouse.warehouse_region == region)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*page_size).limit(page_size))
    return PaginatedResponse(items=[WarehouseResponse.model_validate(r) for r in result.scalars().all()], total=total, page=page, page_size=page_size)

@router.post("/warehouses", response_model=WarehouseResponse, status_code=201)
async def create_warehouse(data: WarehouseCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = Warehouse(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return WarehouseResponse.model_validate(obj)

@router.put("/warehouses/{code}", response_model=WarehouseResponse)
async def update_warehouse(code: str, data: WarehouseUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Warehouse).where(Warehouse.warehouse_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return WarehouseResponse.model_validate(obj)

@router.delete("/warehouses/{code}", response_model=MessageResponse)
async def delete_warehouse(code: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Warehouse).where(Warehouse.warehouse_code == code))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    
    # Data Integrity Check
    for model in [ActualSales, InventoryOnhand, PurchaseOrder, ProductionOrder, StockInTransaction, DemandAdhoc]:
        count = (await db.execute(select(func.count()).select_from(model).where(model.warehouse_code == code))).scalar()
        if count > 0:
            raise HTTPException(status_code=400, detail="Cannot delete warehouse because it is in use by transactions or inventory.")
            
    await db.delete(obj)
    return MessageResponse(message="Deleted")


# â”€â”€ Exchange Rates â”€â”€

@router.get("/exchange-rates", response_model=List[ExchangeRateResponse])
async def list_exchange_rates(year: Optional[int] = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = select(ExchangeRate)
    if year: q = q.where(ExchangeRate.year == year)
    result = await db.execute(q.order_by(ExchangeRate.year.desc(), ExchangeRate.month.desc()))
    return [ExchangeRateResponse.model_validate(r) for r in result.scalars().all()]

@router.post("/exchange-rates", response_model=ExchangeRateResponse, status_code=201)
async def create_exchange_rate(data: ExchangeRateCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = ExchangeRate(**data.model_dump()); db.add(obj); await db.flush(); await db.refresh(obj)
    return ExchangeRateResponse.model_validate(obj)

@router.put("/exchange-rates/{rate_id}", response_model=ExchangeRateResponse)
async def update_exchange_rate(rate_id: int, data: ExchangeRateCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ExchangeRate).where(ExchangeRate.id == rate_id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items(): setattr(obj, k, v)
    await db.flush(); await db.refresh(obj)
    return ExchangeRateResponse.model_validate(obj)

@router.delete("/exchange-rates/{rate_id}", response_model=MessageResponse)
async def delete_exchange_rate(rate_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ExchangeRate).where(ExchangeRate.id == rate_id))
    obj = result.scalar_one_or_none()
    if not obj: raise HTTPException(status_code=404, detail="Not found")
    await db.delete(obj)
    return MessageResponse(message="Deleted")

