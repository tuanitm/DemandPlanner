from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db
from app.models.transactions import ActualSales, InventoryOnhand
from app.models.forecasts import ForecastResult, ForecastAccuracy, ModelType
from app.models.master_data import Item
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary")
async def dashboard_summary(
    view_mode: str = Query("monthly"),
    year: Optional[int] = None,
    month: List[int] = Query(None),
    quarter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    months_filter = []
    if view_mode == 'monthly' and month:
        months_filter = month
    elif view_mode == 'quarterly' and quarter:
        if quarter == 'Q1': months_filter = [1, 2, 3]
        elif quarter == 'Q2': months_filter = [4, 5, 6]
        elif quarter == 'Q3': months_filter = [7, 8, 9]
        elif quarter == 'Q4': months_filter = [10, 11, 12]
        else: months_filter = []

    # 1. KPIs
    # Total Revenue (sum of actual sales amount)
    rev_q = select(func.sum(ActualSales.amount))
    if year: rev_q = rev_q.where(ActualSales.year == year)
    if months_filter: rev_q = rev_q.where(ActualSales.month.in_(months_filter))
    total_revenue = (await db.execute(rev_q)).scalar() or 0

    # Forecast Accuracy (average)
    fa_q = select(func.avg(ForecastAccuracy.fa_percent))
    if year: fa_q = fa_q.where(ForecastAccuracy.year == year)
    if months_filter: fa_q = fa_q.where(ForecastAccuracy.month.in_(months_filter))
    avg_fa = (await db.execute(fa_q)).scalar() or 0

    # Inventory Value (mocked as total quantity * approx value 50k VND)
    inv_q = select(func.sum(InventoryOnhand.quantity))
    total_inv_qty = (await db.execute(inv_q)).scalar() or 0
    inventory_value = total_inv_qty * 50000

    # Stockout SKUs
    stockout_q = select(func.count(InventoryOnhand.item_code)).where(InventoryOnhand.quantity <= 0)
    stockout_skus = (await db.execute(stockout_q)).scalar() or 0

    # Format KPI values
    def format_vnd(val):
        if val >= 1_000_000_000: return f"₫ {val / 1_000_000_000:.1f}B"
        if val >= 1_000_000: return f"₫ {val / 1_000_000:.1f}M"
        return f"₫ {val:,.0f}"

    kpis = [
        {"label": "Total Revenue (VND)", "value": format_vnd(total_revenue), "change": "+0.0%", "positive": True, "color": "#6366f1"},
        {"label": "Forecast Accuracy", "value": f"{avg_fa:.1f}%", "change": "+0.0%", "positive": True, "color": "#22c55e"},
        {"label": "Inventory Value", "value": format_vnd(inventory_value), "change": "0.0%", "positive": True, "color": "#3b82f6"},
        {"label": "Stockout SKUs", "value": str(stockout_skus), "change": "0", "positive": False, "color": "#ef4444"},
    ]

    # 2. Sales Plan vs Actual
    # Get plan by category
    plan_q = select(Item.item_group_code, func.sum(ForecastResult.forecast_qty)).join(Item, ForecastResult.item_code == Item.item_code).where(ForecastResult.model_type == ModelType.ENSEMBLE)
    if year: plan_q = plan_q.where(ForecastResult.year == year)
    if months_filter: plan_q = plan_q.where(ForecastResult.month.in_(months_filter))
    plan_q = plan_q.group_by(Item.item_group_code)
    plan_results = (await db.execute(plan_q)).all()
    plan_map = {row[0]: float(row[1] or 0) for row in plan_results}

    # Get actual by category
    act_q = select(Item.item_group_code, func.sum(ActualSales.quantity)).join(Item, ActualSales.item_code == Item.item_code)
    if year: act_q = act_q.where(ActualSales.year == year)
    if months_filter: act_q = act_q.where(ActualSales.month.in_(months_filter))
    act_q = act_q.group_by(Item.item_group_code)
    act_results = (await db.execute(act_q)).all()
    act_map = {row[0]: float(row[1] or 0) for row in act_results}

    all_categories = set(list(plan_map.keys()) + list(act_map.keys()))
    sales_plan_data = [
        {"category": cat or "Uncategorized", "plan": plan_map.get(cat, 0), "actual": act_map.get(cat, 0)}
        for cat in all_categories
    ]

    # 3. Inventory Structure
    # Use item_attribute if available, otherwise just use a mock distribution based on random hashing or default
    inv_struct_q = select(Item.item_attribute, func.sum(InventoryOnhand.quantity)).join(Item, InventoryOnhand.item_code == Item.item_code).group_by(Item.item_attribute)
    inv_struct_res = (await db.execute(inv_struct_q)).all()
    
    structure_map = {row[0] or 'NORMAL': float(row[1] or 0) for row in inv_struct_res}
    total_stock = sum(structure_map.values()) or 1
    inventory_structure = [
        {"name": "Normal Stock", "value": round(structure_map.get("NORMAL", 0) / total_stock * 100), "color": "#22c55e"},
        {"name": "Slow-moving", "value": round(structure_map.get("SLOW_MOVING", 0) / total_stock * 100), "color": "#f59e0b"},
        {"name": "Near-expiry", "value": round(structure_map.get("NEAR_EXPIRY", 0) / total_stock * 100), "color": "#ef4444"},
    ]

    # 4. Top 10 Best-Selling SKUs
    top_sales_q = select(ActualSales.item_code, Item.item_name, func.sum(ActualSales.quantity).label('qty'), func.sum(ActualSales.amount).label('amt')).join(Item, ActualSales.item_code == Item.item_code)
    if year: top_sales_q = top_sales_q.where(ActualSales.year == year)
    if months_filter: top_sales_q = top_sales_q.where(ActualSales.month.in_(months_filter))
    top_sales_q = top_sales_q.group_by(ActualSales.item_code, Item.item_name).order_by(desc('amt')).limit(10)
    top_sales_res = (await db.execute(top_sales_q)).all()
    top_selling_skus = [
        [row[0], row[1], f"{row[2]:,.0f}", format_vnd(row[3])] for row in top_sales_res
    ]

    # 5. Top 10 Highest Inventory SKUs
    top_inv_q = select(InventoryOnhand.item_code, Item.item_name, func.sum(InventoryOnhand.quantity).label('qty'), Item.item_attribute).join(Item, InventoryOnhand.item_code == Item.item_code)
    top_inv_q = top_inv_q.group_by(InventoryOnhand.item_code, Item.item_name, Item.item_attribute).order_by(desc('qty')).limit(10)
    top_inv_res = (await db.execute(top_inv_q)).all()
    
    def map_status(attr):
        if attr == 'NORMAL': return 'success'
        if attr == 'SLOW_MOVING': return 'warning'
        if attr == 'NEAR_EXPIRY': return 'danger'
        return 'success'

    top_inventory_skus = [
        [row[0], row[1], f"{row[2]:,.0f}", map_status(row[3])] for row in top_inv_res
    ]

    return {
        "kpis": kpis,
        "salesPlanData": sales_plan_data,
        "inventoryStructure": inventory_structure,
        "topSellingSKUs": top_selling_skus,
        "topInventorySKUs": top_inventory_skus,
    }
