"""
Supply Planner — generates purchase/production recommendations with recursive BOM explosion.

For each SKU-warehouse:
  suggested_qty = forecast_qty + safety_stock - onhand - incoming_supply
  safety_stock = Z × σ × √(lead_time_months)

Risk levels:
  Critical: shortage > 50% of forecast
  High:     shortage > 25%
  Medium:   shortage > 0%
  Low:      fully covered

Routes by ItemType:
  Goods       → Purchase Order recommendation
  Finished Goods → Production Order + recursive BOM explosion → RM Purchase
  Raw Material → Purchase Order recommendation
"""
import logging
from collections import defaultdict
from typing import Optional

import numpy as np
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.forecasts import (
    ForecastResult, SupplyRecommendation, ModelType,
    RecommendationType, RiskLevel,
)
from app.models.transactions import (
    ActualSales, InventoryOnhand, PurchaseOrder, ProductionOrder,
)
from app.models.master_data import Item, BillOfMaterial
from app.config import settings

logger = logging.getLogger(__name__)

# Default lead time if not specified on item
DEFAULT_LEAD_TIME_MONTHS = 2


async def generate_recommendations(
    db: AsyncSession,
    item_codes: Optional[list[str]] = None,
    warehouse_codes: Optional[list[str]] = None,
) -> dict:
    """
    Generate supply recommendations based on forecast results.

    Steps:
    1. Get ensemble forecast for next period
    2. Get current on-hand inventory
    3. Get incoming supply (open POs + in-progress MOs)
    4. Compute safety stock from demand variability
    5. Determine recommendation type (PO for goods/RM, MO for FG)
    6. Recursive BOM explosion for FG items → RM purchase requirements
    """
    from sqlalchemy import delete as sa_delete
    from app.services.bom_service import explode_bom, _load_bom_cache

    # Clear existing recommendations
    del_q = sa_delete(SupplyRecommendation)
    if item_codes:
        del_q = del_q.where(SupplyRecommendation.item_code.in_(item_codes))
    if warehouse_codes:
        del_q = del_q.where(SupplyRecommendation.warehouse_code.in_(warehouse_codes))
    await db.execute(del_q)

    # 1. Get ensemble forecasts (aggregate across all forecast months)
    q = select(ForecastResult).where(ForecastResult.model_type == ModelType.ENSEMBLE)
    if item_codes:
        q = q.where(ForecastResult.item_code.in_(item_codes))
    if warehouse_codes:
        q = q.where(ForecastResult.warehouse_code.in_(warehouse_codes))
    result = await db.execute(q)
    forecasts = result.scalars().all()

    if not forecasts:
        return {"message": "No forecast data. Run forecast generation first.", "count": 0}

    # Aggregate forecast by SKU-warehouse (sum all forecast months)
    forecast_agg: dict[tuple[str, str], dict] = defaultdict(lambda: {
        "total_qty": 0, "periods": [], "first_year": 9999, "first_month": 13,
    })
    for f in forecasts:
        key = (f.item_code, f.warehouse_code)
        d = forecast_agg[key]
        d["total_qty"] += f.forecast_qty
        d["periods"].append({"year": f.year, "month": f.month, "qty": f.forecast_qty})
        if (f.year, f.month) < (d["first_year"], d["first_month"]):
            d["first_year"] = f.year
            d["first_month"] = f.month

    # 2. Get current on-hand inventory
    inv_result = await db.execute(
        select(
            InventoryOnhand.item_code,
            InventoryOnhand.warehouse_code,
            func.sum(InventoryOnhand.quantity).label("total_onhand"),
        ).group_by(InventoryOnhand.item_code, InventoryOnhand.warehouse_code)
    )
    onhand_map = {
        (r.item_code, r.warehouse_code): float(r.total_onhand)
        for r in inv_result.all()
    }

    # 3. Get incoming supply from open POs
    po_result = await db.execute(
        select(
            PurchaseOrder.item_code,
            PurchaseOrder.warehouse_code,
            func.sum(PurchaseOrder.quantity - PurchaseOrder.received_qty).label("incoming"),
        ).where(PurchaseOrder.status.in_(["Confirmed", "In Progress"]))
        .group_by(PurchaseOrder.item_code, PurchaseOrder.warehouse_code)
    )
    incoming_po = {
        (r.item_code, r.warehouse_code): max(0, float(r.incoming))
        for r in po_result.all()
    }

    # Get incoming from in-progress MOs
    mo_result = await db.execute(
        select(
            ProductionOrder.item_code,
            ProductionOrder.warehouse_code,
            func.sum(ProductionOrder.quantity - ProductionOrder.completed_qty).label("incoming"),
        ).where(ProductionOrder.status.in_(["Confirmed", "In Progress"]))
        .group_by(ProductionOrder.item_code, ProductionOrder.warehouse_code)
    )
    incoming_mo = {
        (r.item_code, r.warehouse_code): max(0, float(r.incoming))
        for r in mo_result.all()
    }

    # 4. Get demand variability for safety stock
    demand_var = await _get_demand_variability(db)

    # 5. Get item details (type + lead time)
    items_result = await db.execute(
        select(Item.item_code, Item.item_type, Item.lead_time_days)
    )
    item_info = {
        r.item_code: {
            "type": r.item_type,
            "lead_time_months": max(1, (r.lead_time_days or 14) / 30),
        }
        for r in items_result.all()
    }

    # 6. Pre-load BOM data for recursive explosion
    bom_cache = await _load_bom_cache(db)

    # Generate recommendations
    recommendations = []
    rm_requirements: dict[tuple[str, str], dict] = defaultdict(lambda: {
        "required_qty": 0,
        "source_items": set(),
    })

    for (item_code, warehouse_code), fdata in forecast_agg.items():
        forecast_qty = fdata["total_qty"]
        onhand = onhand_map.get((item_code, warehouse_code), 0)
        incoming = incoming_po.get((item_code, warehouse_code), 0) + \
                   incoming_mo.get((item_code, warehouse_code), 0)

        # Lead time from item master, or default
        info = item_info.get(item_code, {"type": "Goods", "lead_time_months": DEFAULT_LEAD_TIME_MONTHS})
        lead_time = info["lead_time_months"]

        # Safety stock: Z × σ × √(lead_time)
        std_dev = demand_var.get((item_code, warehouse_code), forecast_qty * 0.2)
        z = 1.645  # 95% service level
        safety_stock = round(z * std_dev * np.sqrt(lead_time))

        # Suggested quantity
        suggested = max(0, round(forecast_qty + safety_stock - onhand - incoming))

        # Determine recommendation type based on item type
        item_type = info["type"]
        if hasattr(item_type, 'value'):
            item_type_str = item_type.value
        else:
            item_type_str = str(item_type)

        if item_type_str == "Finished Goods":
            rec_type = RecommendationType.PRODUCTION_ORDER
        else:
            rec_type = RecommendationType.PURCHASE_ORDER

        # Risk level
        risk = _compute_risk(forecast_qty, safety_stock, onhand, incoming)

        # Notes
        if suggested > 0:
            notes = (
                f"Forecast: {round(forecast_qty)} + Safety: {safety_stock} "
                f"- OnHand: {round(onhand)} - Incoming: {round(incoming)} "
                f"[LT: {lead_time:.1f}mo]"
            )
        else:
            notes = "Stock sufficient for forecast period"

        recommendations.append(SupplyRecommendation(
            item_code=item_code,
            warehouse_code=warehouse_code,
            recommendation_type=rec_type,
            forecast_qty=round(forecast_qty),
            safety_stock_qty=safety_stock,
            onhand_qty=round(onhand),
            incoming_supply_qty=round(incoming),
            suggested_qty=suggested,
            target_month=fdata["first_month"],
            target_year=fdata["first_year"],
            shortage_risk=risk,
            notes=notes,
        ))

        # Recursive BOM explosion for FG items
        if item_type_str == "Finished Goods" and item_code in bom_cache and suggested > 0:
            from app.services.bom_service import _explode_recursive

            rm_reqs: dict[str, dict] = {}
            _explode_recursive(
                fg_code=item_code,
                quantity=suggested,
                bom_cache=bom_cache,
                rm_requirements=rm_reqs,
                visited=set(),
                depth=0,
                path=[item_code],
            )

            for rm_code, req_data in rm_reqs.items():
                rm_key = (rm_code, warehouse_code)
                rm_requirements[rm_key]["required_qty"] += req_data["required_qty"]
                rm_requirements[rm_key]["source_items"].add(item_code)
                rm_requirements[rm_key]["uom"] = req_data.get("uom", "")
                rm_requirements[rm_key]["level"] = req_data.get("level", 1)

    # Create RM purchase recommendations from BOM explosion
    for (rm_code, warehouse_code), req_info in rm_requirements.items():
        required_qty = req_info["required_qty"]
        rm_onhand = onhand_map.get((rm_code, warehouse_code), 0)
        rm_incoming = incoming_po.get((rm_code, warehouse_code), 0)
        rm_suggested = max(0, round(required_qty - rm_onhand - rm_incoming))

        if rm_suggested > 0:
            source_str = ", ".join(req_info["source_items"])
            risk = RiskLevel.HIGH if rm_suggested > required_qty * 0.5 else RiskLevel.MEDIUM

            recommendations.append(SupplyRecommendation(
                item_code=rm_code,
                warehouse_code=warehouse_code,
                recommendation_type=RecommendationType.RM_PURCHASE,
                forecast_qty=round(required_qty),
                safety_stock_qty=0,
                onhand_qty=round(rm_onhand),
                incoming_supply_qty=round(rm_incoming),
                suggested_qty=rm_suggested,
                target_month=list(forecast_agg.values())[0]["first_month"],
                target_year=list(forecast_agg.values())[0]["first_year"],
                shortage_risk=risk,
                notes=f"BOM requirement (level {req_info.get('level', 1)}) from: {source_str}",
            ))

    if recommendations:
        db.add_all(recommendations)
        await db.flush()

    return {
        "message": "Supply recommendations generated",
        "count": len(recommendations),
        "purchase_orders": sum(
            1 for r in recommendations
            if r.recommendation_type == RecommendationType.PURCHASE_ORDER
        ),
        "production_orders": sum(
            1 for r in recommendations
            if r.recommendation_type == RecommendationType.PRODUCTION_ORDER
        ),
        "rm_purchases": sum(
            1 for r in recommendations
            if r.recommendation_type == RecommendationType.RM_PURCHASE
        ),
    }


def _compute_risk(
    forecast_qty: float,
    safety_stock: float,
    onhand: float,
    incoming: float,
) -> RiskLevel:
    """Compute shortage risk level."""
    if forecast_qty > 0:
        shortage_ratio = max(0, (forecast_qty + safety_stock - onhand - incoming)) / forecast_qty
    else:
        shortage_ratio = 0

    if shortage_ratio > 0.5:
        return RiskLevel.CRITICAL
    elif shortage_ratio > 0.25:
        return RiskLevel.HIGH
    elif shortage_ratio > 0:
        return RiskLevel.MEDIUM
    else:
        return RiskLevel.LOW


async def _get_demand_variability(db: AsyncSession) -> dict[tuple[str, str], float]:
    """Get standard deviation of monthly demand for each SKU-warehouse."""
    q = select(
        ActualSales.item_code,
        ActualSales.warehouse_code,
        ActualSales.year,
        ActualSales.month,
        func.sum(ActualSales.quantity).label("total_qty"),
    ).group_by(
        ActualSales.item_code, ActualSales.warehouse_code,
        ActualSales.year, ActualSales.month,
    )
    result = await db.execute(q)

    grouped: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in result.all():
        grouped[(row.item_code, row.warehouse_code)].append(float(row.total_qty))

    return {
        key: float(np.std(values)) if len(values) > 1 else values[0] * 0.2
        for key, values in grouped.items()
    }
