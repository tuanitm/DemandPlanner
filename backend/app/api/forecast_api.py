"""
Forecast API routes: generate forecasts, view results, accuracy, recommendations,
and manual forecast editing.
"""
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.forecasts import (
    ForecastResult, ForecastAccuracy, SupplyRecommendation,
    ModelType, User,
)
from app.models.forecast_audit import ForecastAuditLog
from app.schemas.schemas import (
    ForecastGenerateRequest, ForecastResultResponse,
    SupplyRecommendationResponse, PaginatedResponse,
    ForecastEditRequest, ForecastBulkEditRequest,
    ForecastRevertRequest, ForecastBulkRevertRequest,
    ForecastAuditLogResponse,
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/forecast", tags=["Forecast"])


# ══════════════════════════════════════════════
# Generate Forecast
# ══════════════════════════════════════════════

@router.post("/generate")
async def generate_forecast(
    request: ForecastGenerateRequest,
    async_mode: bool = Query(False, description="If true, dispatch to Celery background worker"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Run the forecast engine and supply planner.

    Set async_mode=true to dispatch to Celery for background execution.
    Returns a task_id that can be polled via GET /api/forecast/task/{task_id}.
    """
    if async_mode:
        # Dispatch to Celery background worker
        from app.services.tasks import run_full_pipeline_task
        task = run_full_pipeline_task.delay(
            item_codes=request.item_codes,
            warehouse_codes=request.warehouse_codes,
            horizon=request.horizon_months,
            start_year=request.start_year,
            start_month=request.start_month,
        )
        return {
            "message": "Forecast pipeline dispatched to background worker",
            "task_id": task.id,
            "status": "PENDING",
        }

    # Synchronous execution (default — for development/small datasets)
    from app.ml.forecast_engine import generate_forecasts
    from app.ml.supply_planner import generate_recommendations

    # Generate forecasts
    forecast_result = await generate_forecasts(
        db,
        item_codes=request.item_codes,
        warehouse_codes=request.warehouse_codes,
        horizon=request.horizon_months,
        start_year=request.start_year,
        start_month=request.start_month,
    )

    # Generate supply recommendations
    supply_result = await generate_recommendations(
        db,
        item_codes=request.item_codes,
        warehouse_codes=request.warehouse_codes,
    )

    return {
        "forecast": forecast_result,
        "supply": supply_result,
    }


@router.get("/task/{task_id}")
async def get_task_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Check the status of an async forecast task."""
    from app.celery_app import celery_app as celery
    result = celery.AsyncResult(task_id)
    response = {
        "task_id": task_id,
        "status": result.status,
    }
    if result.ready():
        response["result"] = result.result
    elif result.failed():
        response["error"] = str(result.result)
    return response


# ══════════════════════════════════════════════
# Forecast Results
# ══════════════════════════════════════════════

@router.get("/results", response_model=PaginatedResponse)
async def list_forecast_results(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None,
    warehouse_code: Optional[str] = None,
    model_type: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ForecastResult)
    if item_code:
        q = q.where(ForecastResult.item_code == item_code)
    if warehouse_code:
        q = q.where(ForecastResult.warehouse_code == warehouse_code)
    if model_type:
        q = q.where(ForecastResult.model_type == model_type)
    if year:
        q = q.where(ForecastResult.year == year)
    if month:
        q = q.where(ForecastResult.month == month)
    q = q.order_by(ForecastResult.item_code, ForecastResult.year, ForecastResult.month)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    items = [ForecastResultResponse.model_validate(r) for r in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


# ══════════════════════════════════════════════
# Forecast Accuracy
# ══════════════════════════════════════════════

@router.get("/accuracy")
async def list_forecast_accuracy(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None,
    warehouse_code: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ForecastAccuracy)
    if item_code:
        q = q.where(ForecastAccuracy.item_code == item_code)
    if warehouse_code:
        q = q.where(ForecastAccuracy.warehouse_code == warehouse_code)
    q = q.order_by(ForecastAccuracy.fa_percent.asc())

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    rows = result.scalars().all()

    items = [{
        "id": r.id,
        "item_code": r.item_code,
        "warehouse_code": r.warehouse_code,
        "year": r.year,
        "month": r.month,
        "forecast_qty": r.forecast_qty,
        "actual_qty": r.actual_qty,
        "fa_percent": r.fa_percent,
        "model_type": r.model_type.value if r.model_type else "Ensemble",
    } for r in rows]

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/accuracy/summary")
async def accuracy_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregated accuracy KPIs per SKU (averaged across warehouses and months)."""
    q = select(
        ForecastAccuracy.item_code,
        func.avg(ForecastAccuracy.fa_percent).label("avg_fa"),
        func.sum(ForecastAccuracy.actual_qty).label("total_actual"),
        func.count().label("periods"),
    ).group_by(ForecastAccuracy.item_code)

    result = await db.execute(q)
    rows = result.all()

    items = []
    for r in rows:
        fa = round(float(r.avg_fa), 1)
        revenue = round(float(r.total_actual) * 50000 / 1_000_000, 0)  # Rough VND estimate
        zone = "critical" if fa < 50 else "watch" if fa < 70 else "good"
        items.append({
            "item_code": r.item_code,
            "fa_percent": fa,
            "revenue_m": revenue,
            "zone": zone,
            "periods": r.periods,
        })

    # Sort by FA ascending (worst first)
    items.sort(key=lambda x: x["fa_percent"])

    overall_fa = round(sum(i["fa_percent"] for i in items) / len(items), 1) if items else 0

    return {
        "items": items,
        "overall_fa": overall_fa,
        "total_skus": len(items),
        "critical_count": sum(1 for i in items if i["zone"] == "critical"),
        "watch_count": sum(1 for i in items if i["zone"] == "watch"),
        "good_count": sum(1 for i in items if i["zone"] == "good"),
    }


# ══════════════════════════════════════════════
# Monthly Forecast vs Actual
# ══════════════════════════════════════════════

@router.get("/monthly")
async def monthly_comparison(
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Monthly forecast vs actual comparison for chart display."""
    from app.models.transactions import ActualSales

    # Get actual sales by month
    actual_q = select(
        ActualSales.year,
        ActualSales.month,
        func.sum(ActualSales.quantity).label("actual_qty"),
    ).group_by(ActualSales.year, ActualSales.month)
    if year:
        actual_q = actual_q.where(ActualSales.year == year)
    actual_q = actual_q.order_by(ActualSales.year, ActualSales.month)
    actual_result = await db.execute(actual_q)
    actuals = {(r.year, r.month): float(r.actual_qty) for r in actual_result.all()}

    # Get ensemble forecast by month
    forecast_q = select(
        ForecastResult.year,
        ForecastResult.month,
        func.sum(ForecastResult.forecast_qty).label("forecast_qty"),
    ).where(ForecastResult.model_type == ModelType.ENSEMBLE
    ).group_by(ForecastResult.year, ForecastResult.month)
    if year:
        forecast_q = forecast_q.where(ForecastResult.year == year)
    forecast_q = forecast_q.order_by(ForecastResult.year, ForecastResult.month)
    forecast_result = await db.execute(forecast_q)
    forecasts = {(r.year, r.month): float(r.forecast_qty) for r in forecast_result.all()}

    # Merge into monthly view
    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    all_periods = sorted(set(list(actuals.keys()) + list(forecasts.keys())))

    data = []
    for (y, m) in all_periods:
        actual = actuals.get((y, m), 0)
        forecast = forecasts.get((y, m), 0)
        if actual > 0 and forecast > 0:
            fa = round(max(0, (1 - abs(forecast - actual) / actual)) * 100, 1)
        elif actual == 0 and forecast == 0:
            fa = 100.0
        else:
            fa = 0.0

        data.append({
            "year": y,
            "month": m,
            "month_name": month_names[m] if 1 <= m <= 12 else f"M{m}",
            "forecast": round(forecast),
            "actual": round(actual),
            "fa": fa,
        })

    return {"data": data}


# ══════════════════════════════════════════════
# Supply Recommendations
# ══════════════════════════════════════════════

@router.get("/recommendations", response_model=PaginatedResponse)
async def list_recommendations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    recommendation_type: Optional[str] = None,
    shortage_risk: Optional[str] = None,
    item_code: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(SupplyRecommendation)
    if recommendation_type:
        q = q.where(SupplyRecommendation.recommendation_type == recommendation_type)
    if shortage_risk:
        q = q.where(SupplyRecommendation.shortage_risk == shortage_risk)
    if item_code:
        q = q.where(SupplyRecommendation.item_code == item_code)
    q = q.order_by(SupplyRecommendation.shortage_risk.desc(), SupplyRecommendation.suggested_qty.desc())

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    items = [SupplyRecommendationResponse.model_validate(r) for r in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/recommendations/summary")
async def recommendations_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """KPI summary for recommendations dashboard."""
    from app.models.master_data import Item

    result = await db.execute(select(SupplyRecommendation))
    recs = result.scalars().all()

    # Look up item names
    item_codes = list(set(r.item_code for r in recs))
    if item_codes:
        item_result = await db.execute(
            select(Item.item_code, Item.item_name).where(Item.item_code.in_(item_codes))
        )
        item_names = {r.item_code: r.item_name for r in item_result.all()}
    else:
        item_names = {}

    po_recs = [r for r in recs if r.recommendation_type.value == "Purchase Order"]
    mo_recs = [r for r in recs if r.recommendation_type.value == "Production Order"]
    rm_recs = [r for r in recs if r.recommendation_type.value == "RM Purchase"]

    def build_item(r):
        return {
            "item_code": r.item_code,
            "item_name": item_names.get(r.item_code, ""),
            "warehouse_code": r.warehouse_code,
            "forecast_qty": r.forecast_qty,
            "safety_stock": r.safety_stock_qty,
            "onhand": r.onhand_qty,
            "incoming": r.incoming_supply_qty,
            "suggested_qty": r.suggested_qty,
            "risk": r.shortage_risk.value,
            "notes": r.notes,
        }

    return {
        "total": len(recs),
        "purchase_orders": {
            "count": len(po_recs),
            "total_qty": sum(r.suggested_qty for r in po_recs),
            "items": [build_item(r) for r in po_recs],
        },
        "production_orders": {
            "count": len(mo_recs),
            "total_qty": sum(r.suggested_qty for r in mo_recs),
            "items": [build_item(r) for r in mo_recs],
        },
        "rm_purchases": {
            "count": len(rm_recs),
            "total_qty": sum(r.suggested_qty for r in rm_recs),
            "items": [build_item(r) for r in rm_recs],
        },
        "risk_breakdown": {
            "critical": sum(1 for r in recs if r.shortage_risk.value == "Critical"),
            "high": sum(1 for r in recs if r.shortage_risk.value == "High"),
            "medium": sum(1 for r in recs if r.shortage_risk.value == "Medium"),
            "low": sum(1 for r in recs if r.shortage_risk.value == "Low"),
        },
    }


# ══════════════════════════════════════════════
# Forecast Editing
# ══════════════════════════════════════════════

@router.put("/edit")
async def edit_forecast(
    request: ForecastEditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manually adjust a single forecast quantity.
    Records an audit log entry with before/after values.
    """
    result = await db.execute(
        select(ForecastResult).where(ForecastResult.id == request.forecast_id)
    )
    forecast = result.scalar_one_or_none()
    if not forecast:
        raise HTTPException(status_code=404, detail="Forecast record not found")

    # Create audit log entry
    audit = ForecastAuditLog(
        forecast_id=forecast.id,
        item_code=forecast.item_code,
        warehouse_code=forecast.warehouse_code,
        year=forecast.year,
        month=forecast.month,
        original_qty=forecast.forecast_qty,
        previous_adjusted_qty=forecast.adjusted_qty,
        new_adjusted_qty=request.adjusted_qty,
        adjusted_by=current_user.full_name,
        adjustment_reason=request.adjustment_reason,
    )
    db.add(audit)

    # Update forecast record
    forecast.adjusted_qty = request.adjusted_qty
    forecast.adjusted_by = current_user.full_name
    forecast.adjusted_at = datetime.utcnow()
    forecast.adjustment_reason = request.adjustment_reason

    await db.commit()
    await db.refresh(forecast)

    return {
        "message": "Forecast adjusted successfully",
        "forecast": ForecastResultResponse.model_validate(forecast),
    }


@router.put("/edit/bulk")
async def bulk_edit_forecasts(
    request: ForecastBulkEditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk edit multiple forecast quantities.
    Creates audit log entries for each change.
    """
    forecast_ids = [e.forecast_id for e in request.edits]
    result = await db.execute(
        select(ForecastResult).where(ForecastResult.id.in_(forecast_ids))
    )
    forecasts = {f.id: f for f in result.scalars().all()}

    not_found = [eid for eid in forecast_ids if eid not in forecasts]
    if not_found:
        raise HTTPException(
            status_code=404,
            detail=f"Forecast records not found: {not_found}",
        )

    now = datetime.utcnow()
    updated = []
    for edit in request.edits:
        forecast = forecasts[edit.forecast_id]

        # Audit log
        audit = ForecastAuditLog(
            forecast_id=forecast.id,
            item_code=forecast.item_code,
            warehouse_code=forecast.warehouse_code,
            year=forecast.year,
            month=forecast.month,
            original_qty=forecast.forecast_qty,
            previous_adjusted_qty=forecast.adjusted_qty,
            new_adjusted_qty=edit.adjusted_qty,
            adjusted_by=current_user.full_name,
            adjustment_reason=edit.adjustment_reason,
        )
        db.add(audit)

        # Update
        forecast.adjusted_qty = edit.adjusted_qty
        forecast.adjusted_by = current_user.full_name
        forecast.adjusted_at = now
        forecast.adjustment_reason = edit.adjustment_reason
        updated.append(forecast.id)

    await db.commit()

    return {
        "message": f"Successfully adjusted {len(updated)} forecast(s)",
        "updated_ids": updated,
        "count": len(updated),
    }


@router.put("/revert")
async def revert_forecast(
    request: ForecastRevertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revert a single forecast back to the original model prediction."""
    result = await db.execute(
        select(ForecastResult).where(ForecastResult.id == request.forecast_id)
    )
    forecast = result.scalar_one_or_none()
    if not forecast:
        raise HTTPException(status_code=404, detail="Forecast record not found")
    if forecast.adjusted_qty is None:
        raise HTTPException(status_code=400, detail="Forecast has no manual adjustment to revert")

    # Audit log for revert
    audit = ForecastAuditLog(
        forecast_id=forecast.id,
        item_code=forecast.item_code,
        warehouse_code=forecast.warehouse_code,
        year=forecast.year,
        month=forecast.month,
        original_qty=forecast.forecast_qty,
        previous_adjusted_qty=forecast.adjusted_qty,
        new_adjusted_qty=forecast.forecast_qty,  # reverted to original
        adjusted_by=current_user.full_name,
        adjustment_reason="[REVERT] Reverted to model forecast",
    )
    db.add(audit)

    forecast.adjusted_qty = None
    forecast.adjusted_by = None
    forecast.adjusted_at = None
    forecast.adjustment_reason = None

    await db.commit()
    await db.refresh(forecast)

    return {
        "message": "Forecast reverted to original",
        "forecast": ForecastResultResponse.model_validate(forecast),
    }


@router.put("/revert/bulk")
async def bulk_revert_forecasts(
    request: ForecastBulkRevertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revert multiple forecast adjustments."""
    result = await db.execute(
        select(ForecastResult).where(
            ForecastResult.id.in_(request.forecast_ids),
            ForecastResult.adjusted_qty.isnot(None),
        )
    )
    forecasts = result.scalars().all()

    now = datetime.utcnow()
    reverted = []
    for forecast in forecasts:
        audit = ForecastAuditLog(
            forecast_id=forecast.id,
            item_code=forecast.item_code,
            warehouse_code=forecast.warehouse_code,
            year=forecast.year,
            month=forecast.month,
            original_qty=forecast.forecast_qty,
            previous_adjusted_qty=forecast.adjusted_qty,
            new_adjusted_qty=forecast.forecast_qty,
            adjusted_by=current_user.full_name,
            adjustment_reason="[REVERT] Bulk revert to model forecast",
        )
        db.add(audit)

        forecast.adjusted_qty = None
        forecast.adjusted_by = None
        forecast.adjusted_at = None
        forecast.adjustment_reason = None
        reverted.append(forecast.id)

    await db.commit()

    return {
        "message": f"Reverted {len(reverted)} forecast(s)",
        "reverted_ids": reverted,
        "count": len(reverted),
    }


# ══════════════════════════════════════════════
# Audit Log
# ══════════════════════════════════════════════

@router.get("/audit-log")
async def list_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None,
    forecast_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List forecast adjustment audit log with pagination."""
    q = select(ForecastAuditLog)
    if item_code:
        q = q.where(ForecastAuditLog.item_code == item_code)
    if forecast_id:
        q = q.where(ForecastAuditLog.forecast_id == forecast_id)
    q = q.order_by(ForecastAuditLog.created_at.desc())

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    items = [ForecastAuditLogResponse.model_validate(r) for r in result.scalars().all()]

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/edit/summary")
async def edit_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Summary statistics for forecast edits."""
    # Count total adjusted forecasts
    adjusted_count = (await db.execute(
        select(func.count()).select_from(
            select(ForecastResult).where(ForecastResult.adjusted_qty.isnot(None)).subquery()
        )
    )).scalar()

    # Count total forecasts
    total_count = (await db.execute(
        select(func.count()).select_from(select(ForecastResult).subquery())
    )).scalar()

    # Count total audit entries
    audit_count = (await db.execute(
        select(func.count()).select_from(select(ForecastAuditLog).subquery())
    )).scalar()

    # Recent edits
    recent_q = select(ForecastAuditLog).order_by(ForecastAuditLog.created_at.desc()).limit(5)
    recent_result = await db.execute(recent_q)
    recent = [ForecastAuditLogResponse.model_validate(r) for r in recent_result.scalars().all()]

    return {
        "total_forecasts": total_count,
        "adjusted_forecasts": adjusted_count,
        "unadjusted_forecasts": total_count - adjusted_count,
        "total_audit_entries": audit_count,
        "recent_edits": recent,
    }


# ══════════════════════════════════════════════
# Workflow: Historical → AI Baseline → Review
# ══════════════════════════════════════════════

@router.get("/workflow")
async def forecast_workflow(
    item_code: str = Query(..., description="Item code to review"),
    warehouse_code: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Three-step planning workflow data for a single SKU.

    Returns historical sales, AI baseline forecast, and current manual adjustments
    merged into a single time-series for chart + table rendering.
    """
    from app.models.transactions import ActualSales
    from app.models.master_data import Item

    # Item info
    item_result = await db.execute(
        select(Item.item_name, Item.uom).where(Item.item_code == item_code)
    )
    item_row = item_result.first()
    item_name = item_row.item_name if item_row else item_code
    item_uom = item_row.uom if item_row else ""

    # ── Step 1: Historical Sales ──
    hist_q = select(
        ActualSales.year, ActualSales.month,
        func.sum(ActualSales.quantity).label("qty"),
        func.sum(ActualSales.amount).label("amount"),
    ).where(ActualSales.item_code == item_code)
    if warehouse_code:
        hist_q = hist_q.where(ActualSales.warehouse_code == warehouse_code)
    hist_q = hist_q.group_by(ActualSales.year, ActualSales.month)
    hist_q = hist_q.order_by(ActualSales.year, ActualSales.month)
    hist_result = await db.execute(hist_q)
    historicals = {
        (r.year, r.month): {"qty": float(r.qty), "amount": float(r.amount)}
        for r in hist_result.all()
    }

    # ── Step 2: AI Baseline Forecasts (Ensemble only) ──
    fc_q = select(ForecastResult).where(
        ForecastResult.item_code == item_code,
        ForecastResult.model_type == ModelType.ENSEMBLE,
    )
    if warehouse_code:
        fc_q = fc_q.where(ForecastResult.warehouse_code == warehouse_code)
    fc_q = fc_q.order_by(ForecastResult.year, ForecastResult.month)
    fc_result = await db.execute(fc_q)
    forecast_rows = fc_result.scalars().all()

    forecasts = {}
    for f in forecast_rows:
        key = (f.year, f.month, f.warehouse_code)
        forecasts[key] = {
            "id": f.id,
            "forecast_qty": f.forecast_qty,
            "confidence_lower": f.confidence_lower,
            "confidence_upper": f.confidence_upper,
            "adjusted_qty": f.adjusted_qty,
            "adjusted_by": f.adjusted_by,
            "adjusted_at": f.adjusted_at.isoformat() if f.adjusted_at else None,
            "adjustment_reason": f.adjustment_reason,
            "warehouse_code": f.warehouse_code,
        }

    # ── Merge into unified time-series ──
    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    # Collect all periods
    all_periods = set()
    for (y, m) in historicals:
        all_periods.add((y, m))
    for (y, m, _wh) in forecasts:
        all_periods.add((y, m))

    timeline = []
    for (y, m) in sorted(all_periods):
        hist = historicals.get((y, m), {})
        actual_qty = hist.get("qty", 0)

        # Find forecast entries for this period (may be multiple warehouses)
        period_forecasts = [
            v for (fy, fm, _), v in forecasts.items() if fy == y and fm == m
        ]

        if period_forecasts:
            for pf in period_forecasts:
                effective_qty = pf["adjusted_qty"] if pf["adjusted_qty"] is not None else pf["forecast_qty"]
                timeline.append({
                    "year": y,
                    "month": m,
                    "month_name": month_names[m] if 1 <= m <= 12 else f"M{m}",
                    "period_label": f"{month_names[m]} {y}" if 1 <= m <= 12 else f"M{m} {y}",
                    "type": "forecast",
                    "actual_qty": actual_qty,
                    "forecast_qty": pf["forecast_qty"],
                    "adjusted_qty": pf["adjusted_qty"],
                    "effective_qty": effective_qty,
                    "confidence_lower": pf["confidence_lower"],
                    "confidence_upper": pf["confidence_upper"],
                    "adjusted_by": pf["adjusted_by"],
                    "adjusted_at": pf["adjusted_at"],
                    "adjustment_reason": pf["adjustment_reason"],
                    "forecast_id": pf["id"],
                    "warehouse_code": pf["warehouse_code"],
                })
        else:
            # Historical-only period (no forecast)
            timeline.append({
                "year": y,
                "month": m,
                "month_name": month_names[m] if 1 <= m <= 12 else f"M{m}",
                "period_label": f"{month_names[m]} {y}" if 1 <= m <= 12 else f"M{m} {y}",
                "type": "historical",
                "actual_qty": actual_qty,
                "forecast_qty": None,
                "adjusted_qty": None,
                "effective_qty": None,
                "confidence_lower": None,
                "confidence_upper": None,
                "adjusted_by": None,
                "adjusted_at": None,
                "adjustment_reason": None,
                "forecast_id": None,
                "warehouse_code": warehouse_code,
            })

    # Distinct warehouses in forecasts
    wh_list = sorted(set(wh for (_, _, wh) in forecasts.keys()))

    return {
        "item_code": item_code,
        "item_name": item_name,
        "item_uom": item_uom,
        "warehouse_code": warehouse_code,
        "warehouses": wh_list,
        "timeline": timeline,
        "summary": {
            "historical_periods": len(historicals),
            "forecast_periods": len([t for t in timeline if t["type"] == "forecast"]),
            "adjusted_periods": len([t for t in timeline if t["adjusted_qty"] is not None]),
            "total_actual": sum(h["qty"] for h in historicals.values()),
            "total_forecast": sum(t["forecast_qty"] for t in timeline if t["forecast_qty"]),
            "total_adjusted": sum(
                (t["adjusted_qty"] or t["forecast_qty"])
                for t in timeline if t["forecast_qty"]
            ),
        },
    }


@router.get("/workflow/items")
async def workflow_item_list(
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List item codes that have forecasts, for the workflow item picker."""
    from app.models.master_data import Item

    q = select(
        ForecastResult.item_code,
        func.count().label("fc_count"),
        func.max(Item.item_name).label("item_name"),
    ).outerjoin(
        Item, ForecastResult.item_code == Item.item_code
    ).where(
        ForecastResult.model_type == ModelType.ENSEMBLE,
    ).group_by(ForecastResult.item_code)

    if search:
        q = q.where(
            ForecastResult.item_code.contains(search)
            | Item.item_name.contains(search)
        )

    q = q.order_by(ForecastResult.item_code).limit(50)
    result = await db.execute(q)

    items = []
    for r in result.all():
        items.append({
            "item_code": r.item_code,
            "item_name": r.item_name or "",
            "forecast_count": r.fc_count,
        })

    return {"items": items}
