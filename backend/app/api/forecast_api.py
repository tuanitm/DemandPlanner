"""
Forecast API routes: generate forecasts, view results, accuracy, and recommendations.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.forecasts import (
    ForecastResult, ForecastAccuracy, SupplyRecommendation,
    ModelType, User,
)
from app.schemas.schemas import (
    ForecastGenerateRequest, ForecastResultResponse,
    SupplyRecommendationResponse, PaginatedResponse,
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
    result = await db.execute(select(SupplyRecommendation))
    recs = result.scalars().all()

    po_recs = [r for r in recs if r.recommendation_type.value == "Purchase Order"]
    mo_recs = [r for r in recs if r.recommendation_type.value == "Production Order"]
    rm_recs = [r for r in recs if r.recommendation_type.value == "RM Purchase"]

    return {
        "total": len(recs),
        "purchase_orders": {
            "count": len(po_recs),
            "total_qty": sum(r.suggested_qty for r in po_recs),
            "items": [{
                "item_code": r.item_code,
                "warehouse_code": r.warehouse_code,
                "forecast_qty": r.forecast_qty,
                "safety_stock": r.safety_stock_qty,
                "onhand": r.onhand_qty,
                "incoming": r.incoming_supply_qty,
                "suggested_qty": r.suggested_qty,
                "risk": r.shortage_risk.value,
                "notes": r.notes,
            } for r in po_recs],
        },
        "production_orders": {
            "count": len(mo_recs),
            "total_qty": sum(r.suggested_qty for r in mo_recs),
            "items": [{
                "item_code": r.item_code,
                "warehouse_code": r.warehouse_code,
                "forecast_qty": r.forecast_qty,
                "safety_stock": r.safety_stock_qty,
                "onhand": r.onhand_qty,
                "incoming": r.incoming_supply_qty,
                "suggested_qty": r.suggested_qty,
                "risk": r.shortage_risk.value,
                "notes": r.notes,
            } for r in mo_recs],
        },
        "rm_purchases": {
            "count": len(rm_recs),
            "total_qty": sum(r.suggested_qty for r in rm_recs),
            "items": [{
                "item_code": r.item_code,
                "warehouse_code": r.warehouse_code,
                "forecast_qty": r.forecast_qty,
                "onhand": r.onhand_qty,
                "incoming": r.incoming_supply_qty,
                "suggested_qty": r.suggested_qty,
                "risk": r.shortage_risk.value,
                "notes": r.notes,
            } for r in rm_recs],
        },
        "risk_breakdown": {
            "critical": sum(1 for r in recs if r.shortage_risk.value == "Critical"),
            "high": sum(1 for r in recs if r.shortage_risk.value == "High"),
            "medium": sum(1 for r in recs if r.shortage_risk.value == "Medium"),
            "low": sum(1 for r in recs if r.shortage_risk.value == "Low"),
        },
    }
