"""
Sales Forecast API routes.
CRUD + bulk upsert for the planning spreadsheet data.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete
from app.database import get_db
from app.models.forecasts import SalesForecast, User
from app.schemas.schemas import (
    SalesForecastCreate, SalesForecastUpdate, SalesForecastResponse,
    PaginatedResponse, MessageResponse
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/sales-forecast", tags=["Sales Forecast"])


# ══════════════════════════════════════════════
# List (with pagination + filters)
# ══════════════════════════════════════════════

@router.get("", response_model=PaginatedResponse)
async def list_sales_forecast(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    year: Optional[int] = None,
    brand: Optional[List[str]] = Query(None),
    channel: Optional[List[str]] = Query(None),
    region: Optional[List[str]] = Query(None),
    product_group: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(SalesForecast)
    if year is not None:
        q = q.where(SalesForecast.year == year)
    if brand:
        q = q.where(SalesForecast.brand.in_(brand))
    if channel:
        q = q.where(SalesForecast.channel.in_(channel))
    if region:
        q = q.where(SalesForecast.region.in_(region))
    if product_group:
        q = q.where(SalesForecast.product_group.in_(product_group))
    if search:
        pattern = f"%{search}%"
        q = q.where(
            SalesForecast.sku_code.contains(search)
            | SalesForecast.sku_name.contains(search)
            | SalesForecast.brand.contains(search)
            | SalesForecast.product_group.contains(search)
        )
    q = q.order_by(SalesForecast.brand, SalesForecast.product_group, SalesForecast.sku_code, SalesForecast.channel, SalesForecast.region)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    rows = result.scalars().all()

    items = [SalesForecastResponse.model_validate(r).model_dump() for r in rows]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


# ══════════════════════════════════════════════
# Bulk Upsert (insert or update by unique key)
# ══════════════════════════════════════════════

@router.post("/bulk", status_code=200)
async def bulk_upsert_sales_forecast(
    rows: List[SalesForecastCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk upsert sales forecast rows.
    Uses (year, sku_code, channel, region) as the unique key.
    If a row with the same key exists, it is updated; otherwise, a new row is inserted.
    """
    inserted = 0
    updated = 0

    for row_data in rows:
        # Check if a row with the same unique key exists
        existing = await db.execute(
            select(SalesForecast).where(
                SalesForecast.year == row_data.year,
                SalesForecast.sku_code == row_data.sku_code,
                SalesForecast.channel == row_data.channel,
                SalesForecast.region == row_data.region,
            )
        )
        existing_row = existing.scalar_one_or_none()

        if existing_row:
            # Update existing row
            for field, value in row_data.model_dump().items():
                setattr(existing_row, field, value)
            updated += 1
        else:
            # Insert new row
            obj = SalesForecast(**row_data.model_dump())
            db.add(obj)
            inserted += 1

    await db.flush()
    return {
        "message": f"Bulk upsert completed: {inserted} inserted, {updated} updated",
        "inserted": inserted,
        "updated": updated,
        "total": inserted + updated,
    }


# ══════════════════════════════════════════════
# Update single row
# ══════════════════════════════════════════════

@router.put("/{row_id}", response_model=SalesForecastResponse)
async def update_sales_forecast(
    row_id: int,
    data: SalesForecastUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SalesForecast).where(SalesForecast.id == row_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales forecast row not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(obj, field, value)

    await db.flush()
    await db.refresh(obj)
    return SalesForecastResponse.model_validate(obj)


# ══════════════════════════════════════════════
# Delete by year (with optional filters)
# ══════════════════════════════════════════════

@router.delete("")
async def delete_sales_forecast(
    year: int = Query(..., description="Year to delete forecasts for"),
    brand: Optional[List[str]] = Query(None),
    channel: Optional[List[str]] = Query(None),
    region: Optional[List[str]] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = sa_delete(SalesForecast).where(SalesForecast.year == year)
    if brand:
        q = q.where(SalesForecast.brand.in_(brand))
    if channel:
        q = q.where(SalesForecast.channel.in_(channel))
    if region:
        q = q.where(SalesForecast.region.in_(region))

    result = await db.execute(q)
    deleted = result.rowcount
    return {"message": f"Deleted {deleted} forecast rows for year {year}", "deleted": deleted}
