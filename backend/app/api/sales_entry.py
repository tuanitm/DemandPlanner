"""
Sales Entry API routes.
CRUD + bulk upsert for the actual sales planning grid data.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete
from app.database import get_db
from app.models.forecasts import SalesEntry, User
from app.schemas.schemas import (
    SalesEntryCreate, SalesEntryUpdate, SalesEntryResponse,
    PaginatedResponse, MessageResponse
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/sales-entry", tags=["Sales Entry"])


# ══════════════════════════════════════════════
# List (with pagination + filters)
# ══════════════════════════════════════════════

@router.get("", response_model=PaginatedResponse)
async def list_sales_entry(
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
    q = select(SalesEntry)
    if year is not None:
        q = q.where(SalesEntry.year == year)
    if brand:
        q = q.where(SalesEntry.brand.in_(brand))
    if channel:
        q = q.where(SalesEntry.channel.in_(channel))
    if region:
        q = q.where(SalesEntry.region.in_(region))
    if product_group:
        q = q.where(SalesEntry.product_group.in_(product_group))
    if search:
        q = q.where(
            SalesEntry.sku_code.contains(search)
            | SalesEntry.sku_name.contains(search)
            | SalesEntry.brand.contains(search)
            | SalesEntry.product_group.contains(search)
        )
    q = q.order_by(SalesEntry.brand, SalesEntry.product_group, SalesEntry.sku_code, SalesEntry.channel, SalesEntry.region)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    rows = result.scalars().all()

    items = [SalesEntryResponse.model_validate(r).model_dump() for r in rows]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


# ══════════════════════════════════════════════
# Bulk Upsert (insert or update by unique key)
# ══════════════════════════════════════════════

@router.post("/bulk", status_code=200)
async def bulk_upsert_sales_entry(
    rows: List[SalesEntryCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk upsert sales entry rows.
    Uses (year, sku_code, channel, region) as the unique key.
    If a row with the same key exists, it is updated; otherwise, a new row is inserted.
    """
    inserted = 0
    updated = 0

    for row_data in rows:
        existing = await db.execute(
            select(SalesEntry).where(
                SalesEntry.year == row_data.year,
                SalesEntry.sku_code == row_data.sku_code,
                SalesEntry.channel == row_data.channel,
                SalesEntry.region == row_data.region,
            )
        )
        existing_row = existing.scalar_one_or_none()

        if existing_row:
            for field, value in row_data.model_dump().items():
                setattr(existing_row, field, value)
            updated += 1
        else:
            obj = SalesEntry(**row_data.model_dump())
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

@router.put("/{row_id}", response_model=SalesEntryResponse)
async def update_sales_entry(
    row_id: int,
    data: SalesEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SalesEntry).where(SalesEntry.id == row_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales entry row not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(obj, field, value)

    await db.flush()
    await db.refresh(obj)
    return SalesEntryResponse.model_validate(obj)


# ══════════════════════════════════════════════
# Delete by year (with optional filters)
# ══════════════════════════════════════════════

@router.delete("")
async def delete_sales_entry(
    year: int = Query(..., description="Year to delete sales entries for"),
    brand: Optional[List[str]] = Query(None),
    channel: Optional[List[str]] = Query(None),
    region: Optional[List[str]] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = sa_delete(SalesEntry).where(SalesEntry.year == year)
    if brand:
        q = q.where(SalesEntry.brand.in_(brand))
    if channel:
        q = q.where(SalesEntry.channel.in_(channel))
    if region:
        q = q.where(SalesEntry.region.in_(region))

    result = await db.execute(q)
    deleted = result.rowcount
    return {"message": f"Deleted {deleted} sales entry rows for year {year}", "deleted": deleted}
