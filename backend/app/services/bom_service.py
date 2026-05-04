"""
BOM (Bill of Material) Explosion Service.

Provides recursive BOM explosion: given a production order for a
finished good, calculates ALL required raw materials across ALL BOM levels.

Handles:
  - Multi-level BOM trees (FG → Sub-Assembly → Raw Material)
  - Circular reference detection
  - Quantity multiplier accumulation across levels
"""
import logging
from collections import defaultdict
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.master_data import BillOfMaterial, Item

logger = logging.getLogger(__name__)

# Maximum BOM depth to prevent infinite recursion
MAX_BOM_DEPTH = 10


async def explode_bom(
    db: AsyncSession,
    finished_goods_code: str,
    quantity: float,
    bom_cache: Optional[dict] = None,
) -> list[dict]:
    """
    Recursively explode BOM for a finished goods item.

    Args:
        db: database session.
        finished_goods_code: item code of the finished good.
        quantity: number of FG units to produce.
        bom_cache: optional pre-loaded BOM data to avoid repeated queries.

    Returns:
        list of dicts with keys: rm_code, rm_name, required_qty, uom, level, path.
    """
    if bom_cache is None:
        bom_cache = await _load_bom_cache(db)

    # Track accumulated RM requirements
    rm_requirements: dict[str, dict] = {}

    # Recursive explosion
    _explode_recursive(
        fg_code=finished_goods_code,
        quantity=quantity,
        bom_cache=bom_cache,
        rm_requirements=rm_requirements,
        visited=set(),
        depth=0,
        path=[finished_goods_code],
    )

    return list(rm_requirements.values())


def _explode_recursive(
    fg_code: str,
    quantity: float,
    bom_cache: dict[str, list[dict]],
    rm_requirements: dict[str, dict],
    visited: set,
    depth: int,
    path: list[str],
):
    """
    Recursive BOM traversal.

    For each component of fg_code:
      - If it's a raw material (no BOM children), accumulate the requirement.
      - If it has its own BOM (sub-assembly/finished good), recurse deeper.
    """
    if depth >= MAX_BOM_DEPTH:
        logger.warning(
            f"BOM depth limit ({MAX_BOM_DEPTH}) reached at {fg_code}. "
            f"Path: {' → '.join(path)}"
        )
        return

    if fg_code in visited:
        logger.error(
            f"Circular BOM reference detected: {fg_code}. "
            f"Path: {' → '.join(path)}"
        )
        return

    visited.add(fg_code)

    components = bom_cache.get(fg_code, [])

    for comp in components:
        rm_code = comp["rm_code"]
        qty_per_unit = comp["qty_per_unit"]
        uom = comp["uom"]
        required_qty = quantity * qty_per_unit

        # Check if this component has its own BOM (is a sub-assembly)
        if rm_code in bom_cache and bom_cache[rm_code]:
            # Sub-assembly: recurse deeper
            _explode_recursive(
                fg_code=rm_code,
                quantity=required_qty,
                bom_cache=bom_cache,
                rm_requirements=rm_requirements,
                visited=visited.copy(),  # Copy to allow different paths
                depth=depth + 1,
                path=path + [rm_code],
            )
        else:
            # Raw material (leaf node): accumulate
            if rm_code in rm_requirements:
                rm_requirements[rm_code]["required_qty"] += required_qty
            else:
                rm_requirements[rm_code] = {
                    "rm_code": rm_code,
                    "required_qty": required_qty,
                    "uom": uom,
                    "level": depth + 1,
                    "path": " → ".join(path + [rm_code]),
                }


async def _load_bom_cache(db: AsyncSession) -> dict[str, list[dict]]:
    """Load all BOM data into memory for efficient recursive traversal."""
    result = await db.execute(select(BillOfMaterial))
    bom_records = result.scalars().all()

    cache: dict[str, list[dict]] = defaultdict(list)
    for b in bom_records:
        cache[b.finished_goods_item_code].append({
            "rm_code": b.raw_material_item_code,
            "qty_per_unit": b.quantity,
            "uom": b.uom,
        })

    return dict(cache)


async def get_rm_requirements_for_items(
    db: AsyncSession,
    production_items: list[dict],
) -> dict[str, dict]:
    """
    Batch BOM explosion for multiple production items.

    Args:
        production_items: list of dicts with 'item_code', 'warehouse_code', 'quantity'.

    Returns:
        dict of rm_code → {required_qty, uom, source_items, ...}.
    """
    bom_cache = await _load_bom_cache(db)

    all_rm: dict[str, dict] = {}

    for item in production_items:
        fg_code = item["item_code"]
        quantity = item["quantity"]
        warehouse = item.get("warehouse_code", "")

        requirements = await explode_bom(db, fg_code, quantity, bom_cache)

        for req in requirements:
            rm_code = req["rm_code"]
            key = f"{rm_code}@{warehouse}"

            if key in all_rm:
                all_rm[key]["required_qty"] += req["required_qty"]
                all_rm[key]["source_items"].add(fg_code)
            else:
                all_rm[key] = {
                    "rm_code": rm_code,
                    "warehouse_code": warehouse,
                    "required_qty": req["required_qty"],
                    "uom": req["uom"],
                    "level": req["level"],
                    "source_items": {fg_code},
                }

    # Convert sets to lists for serialization
    for v in all_rm.values():
        v["source_items"] = list(v["source_items"])

    return all_rm
