from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db
from app.models.transactions import ActualSales, InventoryOnhand
from app.models.forecasts import ForecastResult, ForecastAccuracy, ModelType
from app.models.master_data import Item, ProductHierarchy, Warehouse
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
    plan_q = (
        select(Item.item_group_code, func.sum(ForecastResult.forecast_qty))
        .select_from(ForecastResult)
        .join(Item, ForecastResult.item_code == Item.item_code)
        .where(ForecastResult.model_type == ModelType.ENSEMBLE)
    )
    if year: plan_q = plan_q.where(ForecastResult.year == year)
    if months_filter: plan_q = plan_q.where(ForecastResult.month.in_(months_filter))
    plan_q = plan_q.group_by(Item.item_group_code)
    plan_results = (await db.execute(plan_q)).all()
    plan_map = {row[0]: float(row[1] or 0) for row in plan_results}

    # Get actual by category
    act_q = (
        select(Item.item_group_code, func.sum(ActualSales.quantity))
        .select_from(ActualSales)
        .join(Item, ActualSales.item_code == Item.item_code)
    )
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
    # Use item_attribute if available, otherwise default to Normal
    inv_struct_q = (
        select(Item.item_attribute, func.sum(InventoryOnhand.quantity))
        .select_from(InventoryOnhand)
        .join(Item, InventoryOnhand.item_code == Item.item_code)
        .group_by(Item.item_attribute)
    )
    inv_struct_res = (await db.execute(inv_struct_q)).all()
    
    # item_attribute is an Enum — extract string value for reliable key lookup
    structure_map = {}
    for row in inv_struct_res:
        attr = row[0]
        # Handle both enum objects and raw strings
        key = attr.value if hasattr(attr, 'value') else (str(attr) if attr else 'Normal')
        structure_map[key] = structure_map.get(key, 0) + float(row[1] or 0)
    # Default any None/missing attributes to Normal
    if 'Normal' not in structure_map and None not in structure_map:
        pass  # no defaulting needed
    total_stock = sum(structure_map.values()) or 1
    inventory_structure = [
        {"name": "Normal Stock", "value": round(structure_map.get("Normal", 0) / total_stock * 100), "color": "#22c55e"},
        {"name": "Slow-moving", "value": round(structure_map.get("Slow-Moving", 0) / total_stock * 100), "color": "#f59e0b"},
        {"name": "Fast-moving", "value": round(structure_map.get("Fast-Moving", 0) / total_stock * 100), "color": "#3b82f6"},
    ]

    # 4. Top 10 Best-Selling SKUs
    top_sales_q = (
        select(
            ActualSales.item_code,
            Item.item_name,
            func.sum(ActualSales.quantity).label('qty'),
            func.sum(ActualSales.amount).label('amt'),
        )
        .select_from(ActualSales)
        .join(Item, ActualSales.item_code == Item.item_code)
    )
    if year: top_sales_q = top_sales_q.where(ActualSales.year == year)
    if months_filter: top_sales_q = top_sales_q.where(ActualSales.month.in_(months_filter))
    top_sales_q = top_sales_q.group_by(ActualSales.item_code, Item.item_name).order_by(desc('amt')).limit(10)
    top_sales_res = (await db.execute(top_sales_q)).all()
    top_selling_skus = [
        [row[0], row[1], f"{row[2]:,.0f}", format_vnd(row[3])] for row in top_sales_res
    ]

    # 5. Top 10 Highest Inventory SKUs
    top_inv_q = (
        select(
            InventoryOnhand.item_code,
            Item.item_name,
            func.sum(InventoryOnhand.quantity).label('qty'),
            Item.item_attribute,
        )
        .select_from(InventoryOnhand)
        .join(Item, InventoryOnhand.item_code == Item.item_code)
    )
    top_inv_q = top_inv_q.group_by(InventoryOnhand.item_code, Item.item_name, Item.item_attribute).order_by(desc('qty')).limit(10)
    top_inv_res = (await db.execute(top_inv_q)).all()
    
    def map_status(attr):
        # Handle both enum objects and raw strings
        attr_val = attr.value if hasattr(attr, 'value') else str(attr) if attr else 'Normal'
        if attr_val == 'Normal': return 'success'
        if attr_val == 'Slow-Moving': return 'warning'
        if attr_val == 'Fast-Moving': return 'info'
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


@router.get("/monthly-comparison")
async def monthly_comparison_dashboard(
    year: int = Query(..., description="Year to compare"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    # 1. Fetch Forecast
    forecast_q = (
        select(
            ForecastResult.item_code,
            ForecastResult.warehouse_code,
            ForecastResult.month,
            func.sum(ForecastResult.forecast_qty).label("forecast_qty")
        )
        .where(ForecastResult.year == year)
        .where(ForecastResult.model_type == ModelType.ENSEMBLE)
        .group_by(ForecastResult.item_code, ForecastResult.warehouse_code, ForecastResult.month)
    )
    forecast_res = await db.execute(forecast_q)
    forecasts = forecast_res.all()

    # 2. Fetch Actuals
    actual_q = (
        select(
            ActualSales.item_code,
            ActualSales.warehouse_code,
            ActualSales.month,
            func.sum(ActualSales.quantity).label("actual_qty")
        )
        .where(ActualSales.year == year)
        .group_by(ActualSales.item_code, ActualSales.warehouse_code, ActualSales.month)
    )
    actual_res = await db.execute(actual_q)
    actuals = actual_res.all()

    # 3. Fetch Items & ProductHierarchy
    item_q = (
        select(
            Item.item_code,
            Item.item_name,
            ProductHierarchy.brand,
            ProductHierarchy.item_group_name
        )
        .outerjoin(ProductHierarchy, Item.item_group_code == ProductHierarchy.item_group_code)
    )
    item_res = await db.execute(item_q)
    items_map = {
        row.item_code: {
            "item_name": row.item_name,
            "brand": row.brand or "Unknown",
            "product_group": row.item_group_name or "Unknown"
        }
        for row in item_res.all()
    }

    # 4. Fetch Warehouses
    wh_q = select(Warehouse.warehouse_code, Warehouse.warehouse_name, Warehouse.warehouse_region)
    wh_res = await db.execute(wh_q)
    wh_map = {
        row.warehouse_code: {
            "warehouse_name": row.warehouse_name,
            "warehouse_region": row.warehouse_region or "Unknown"
        }
        for row in wh_res.all()
    }

    # Aggregate by (item_code, warehouse_code, month)
    aggregated = {}
    
    for row in forecasts:
        key = (row.item_code, row.warehouse_code, row.month)
        if key not in aggregated:
            aggregated[key] = {"forecast": 0, "actual": 0}
        aggregated[key]["forecast"] += float(row.forecast_qty or 0)

    for row in actuals:
        key = (row.item_code, row.warehouse_code, row.month)
        if key not in aggregated:
            aggregated[key] = {"forecast": 0, "actual": 0}
        aggregated[key]["actual"] += float(row.actual_qty or 0)

    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    data = []
    brands_set = set()
    product_groups_set = set()

    for (ic, wc, m), metrics in aggregated.items():
        item_info = items_map.get(ic, {"item_name": ic, "brand": "Unknown", "product_group": "Unknown"})
        wh_info = wh_map.get(wc, {"warehouse_name": wc, "warehouse_region": "Unknown"})

        brand = item_info["brand"]
        pg = item_info["product_group"]

        if brand and brand != "Unknown": brands_set.add(brand)
        if pg and pg != "Unknown": product_groups_set.add(pg)

        data.append({
            "brand": brand,
            "product_group": pg,
            "item_code": ic,
            "item_name": item_info["item_name"],
            "warehouse_code": wc,
            "warehouse_name": wh_info["warehouse_name"],
            "warehouse_region": wh_info["warehouse_region"],
            "month_name": month_names[m] if 1 <= m <= 12 else f"M{m}",
            "forecast": metrics["forecast"],
            "actual": metrics["actual"]
        })

    brands = sorted(list(brands_set))
    product_groups = [{"code": pg, "name": pg} for pg in sorted(list(product_groups_set))]

    return {
        "data": data,
        "brands": brands,
        "product_groups": product_groups
    }

