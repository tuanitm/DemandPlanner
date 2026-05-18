"""
Excel import/export API routes for Master Data.
Provides template download and bulk import for each entity.
"""
import io
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from app.database import get_db
from app.models.master_data import (
    PartnerGroup, Partner, ProductHierarchy, Item,
    BillOfMaterial, Warehouse, ExchangeRate
)
from app.models.transactions import (
    ActualSales, InventoryOnhand, PurchaseOrder,
    ProductionOrder, StockInTransaction, DemandAdhoc
)
from app.models.forecasts import User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/master-data/import", tags=["Master Data Import"])

# ── Styling constants ──
HEADER_FONT = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
HEADER_FILL = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
HEADER_ALIGNMENT = Alignment(horizontal="center", vertical="center", wrap_text=True)
THIN_BORDER = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"), bottom=Side(style="thin"),
)

# ── Template definitions per entity ──
TEMPLATES = {
    "partner-groups": {
        "sheet_name": "Partner Groups",
        "columns": [
            ("channel", "Channel", 18, "Domestic / Export / E-Commerce / Modern Trade / General Trade / Other"),
            ("partner_grp_type", "Type", 14, "Customer / Supplier"),
            ("partner_grp_code", "Group Code", 16, "Unique code (e.g. CG-001)"),
            ("partner_grp_name", "Group Name", 30, "Full name"),
            ("status", "Status", 12, "Active / Inactive"),
        ],
        "model": PartnerGroup,
    },
    "partners": {
        "sheet_name": "Partners",
        "columns": [
            ("partner_grp_code", "Group Code", 16, "Must match existing group code"),
            ("partner_code", "Partner Code", 16, "Unique code (e.g. BP-001)"),
            ("partner_name", "Partner Name", 30, "Full business name"),
            ("partner_mst_code", "Tax Code (MST)", 16, "Optional"),
            ("partner_address", "Address", 40, "Optional"),
            ("status", "Status", 12, "Active / Inactive"),
        ],
        "model": Partner,
    },
    "product-hierarchy": {
        "sheet_name": "Product Hierarchy",
        "columns": [
            ("business", "Business", 16, "e.g. Personal Care"),
            ("brand", "Brand", 16, "e.g. GlowUp"),
            ("item_category_code", "Category Code", 16, "e.g. CAT-SC"),
            ("item_category_name", "Category Name", 22, "e.g. Skincare"),
            ("item_group_code", "Group Code", 16, "Unique (e.g. GRP-FACE)"),
            ("item_group_name", "Group Name", 22, "e.g. Face Care"),
            ("status", "Status", 12, "Active / Inactive"),
        ],
        "model": ProductHierarchy,
    },
    "items": {
        "sheet_name": "Items (SKUs)",
        "columns": [
            ("item_group_code", "Group Code", 16, "Must match existing group"),
            ("item_code", "Item Code", 14, "Unique (e.g. SKU-001)"),
            ("item_name", "Item Name", 35, "Full product name"),
            ("item_for_name", "Foreign Name", 25, "Optional"),
            ("item_partner_code", "Partner Code", 16, "Optional"),
            ("uom", "UoM", 8, "PCS / KG / LT / BOX"),
            ("item_type", "Item Type", 16, "Goods / Finished Goods / Raw Material"),
            ("import_lead_time_days", "Import Lead Time (days)", 20, "Number — PO lead time (default: 30)"),
            ("production_lead_time_days", "Production Lead Time (days)", 22, "Number — MO lead time (default: 14)"),
            ("status", "Status", 12, "Active / Inactive"),
        ],
        "model": Item,
    },
    "warehouses": {
        "sheet_name": "Warehouses",
        "columns": [
            ("warehouse_region", "Region", 14, "e.g. South / North / Central"),
            ("warehouse_code", "Code", 14, "Unique (e.g. WH-HCM1)"),
            ("warehouse_name", "Name", 30, "Full warehouse name"),
            ("warehouse_attribute", "Attribute", 18, "e.g. General / Cold Storage"),
            ("warehouse_status", "Status", 12, "Active / Inactive"),
        ],
        "model": Warehouse,
    },
    "bom": {
        "sheet_name": "Bill of Materials",
        "columns": [
            ("finished_goods_item_code", "FG Item Code", 18, "Finished goods code"),
            ("raw_material_item_code", "RM Item Code", 18, "Raw material code"),
            ("quantity", "Quantity", 12, "Amount per unit"),
            ("uom", "UoM", 8, "KG / LT / PCS"),
        ],
        "model": BillOfMaterial,
    },
    "exchange-rates": {
        "sheet_name": "Exchange Rates",
        "columns": [
            ("year", "Year", 10, "e.g. 2026"),
            ("month", "Month", 10, "1-12"),
            ("from_currency", "From Currency", 14, "e.g. VND"),
            ("to_currency", "To Currency", 14, "e.g. USD"),
            ("rate", "Rate", 14, "Exchange rate value"),
        ],
        "model": ExchangeRate,
    },
    # ── Transaction templates ──
    "actual-sales": {
        "sheet_name": "Actual Sales",
        "columns": [
            ("item_code", "Item Code", 14, "Must match existing item"),
            ("warehouse_code", "Warehouse Code", 16, "Must match existing warehouse"),
            ("partner_code", "Partner Code", 16, "Optional — match existing partner"),
            ("year", "Year", 10, "e.g. 2026"),
            ("month", "Month", 10, "1-12"),
            ("quantity", "Quantity", 12, "Sales quantity"),
            ("amount", "Amount (VND)", 14, "Sales amount in VND"),
            ("source", "Source", 12, "Manual / Excel / SAP"),
        ],
        "model": ActualSales,
    },
    "inventory": {
        "sheet_name": "Inventory On-hand",
        "columns": [
            ("item_code", "Item Code", 14, "Must match existing item"),
            ("warehouse_code", "Warehouse Code", 16, "Must match existing warehouse"),
            ("quantity", "Quantity", 12, "On-hand quantity"),
            ("unit_cost", "Unit Cost (VND)", 16, "Cost per unit"),
            ("expiry_date", "Expiry Date", 14, "YYYY-MM-DD (optional)"),
            ("batch_number", "Batch Number", 16, "Optional"),
        ],
        "model": InventoryOnhand,
    },
    "purchase-orders": {
        "sheet_name": "Purchase Orders",
        "columns": [
            ("po_number", "PO Number", 14, "Unique (e.g. PO-001)"),
            ("item_code", "Item Code", 14, "Must match existing item"),
            ("warehouse_code", "Warehouse Code", 16, "Must match existing warehouse"),
            ("partner_code", "Partner Code", 16, "Optional — supplier code"),
            ("quantity", "Order Qty", 12, "Ordered quantity"),
            ("received_qty", "Received Qty", 12, "Received so far (default: 0)"),
            ("eta", "ETA", 14, "YYYY-MM-DD"),
            ("status", "Status", 14, "Confirmed / In Progress / Completed"),
            ("source", "Source", 12, "Manual / Excel / SAP"),
        ],
        "model": PurchaseOrder,
    },
    "production-orders": {
        "sheet_name": "Production Orders",
        "columns": [
            ("mo_number", "MO Number", 14, "Unique (e.g. MO-001)"),
            ("item_code", "Item Code", 14, "Must match existing item"),
            ("warehouse_code", "Warehouse Code", 16, "Must match existing warehouse"),
            ("quantity", "Planned Qty", 12, "Planned quantity"),
            ("completed_qty", "Completed Qty", 12, "Completed so far (default: 0)"),
            ("planned_date", "Planned Date", 14, "YYYY-MM-DD"),
            ("status", "Status", 14, "Confirmed / In Progress / Completed"),
            ("source", "Source", 12, "Manual / Excel / SAP"),
        ],
        "model": ProductionOrder,
    },
    "stock-in": {
        "sheet_name": "Stock In Transactions",
        "columns": [
            ("trans_type", "Type", 18, "Supplier Receipt / Production Receipt / Other Receipt"),
            ("item_code", "Item Code", 14, "Must match existing item"),
            ("warehouse_code", "Warehouse Code", 16, "Must match existing warehouse"),
            ("quantity", "Quantity", 12, "Received quantity"),
            ("reference_number", "Reference #", 16, "PO or MO reference"),
            ("trans_date", "Date", 14, "YYYY-MM-DD"),
            ("source", "Source", 12, "Manual / Excel / SAP"),
        ],
        "model": StockInTransaction,
    },
    "adhoc-demand": {
        "sheet_name": "Ad-hoc Demand",
        "columns": [
            ("item_code", "Item Code", 14, "Must match existing item"),
            ("warehouse_code", "Warehouse Code", 16, "Must match existing warehouse"),
            ("quantity", "Quantity", 12, "Demand quantity"),
            ("demand_source", "Source", 20, "e.g. Special Order / Promotion"),
            ("demand_date", "Date", 14, "YYYY-MM-DD"),
            ("notes", "Notes", 30, "Optional comments"),
        ],
        "model": DemandAdhoc,
    },
}


def _create_template_workbook(entity_key: str) -> Workbook:
    """Create a formatted Excel template for the given entity."""
    tmpl = TEMPLATES[entity_key]
    wb = Workbook()
    ws = wb.active
    ws.title = tmpl["sheet_name"]

    # Instruction row
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(tmpl["columns"]))
    instr_cell = ws.cell(row=1, column=1)
    instr_cell.value = f"Import Template: {tmpl['sheet_name']} — Fill data starting from row 4. Do not modify headers."
    instr_cell.font = Font(name="Calibri", italic=True, color="4472C4", size=10)

    # Headers (row 3)
    for col_idx, (field, header, width, hint) in enumerate(tmpl["columns"], 1):
        # Header
        cell = ws.cell(row=3, column=col_idx, value=header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = HEADER_ALIGNMENT
        cell.border = THIN_BORDER
        ws.column_dimensions[cell.column_letter].width = width

    # Hint row (row 2) — shows expected format
    hint_fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
    hint_font = Font(name="Calibri", italic=True, color="806600", size=9)
    for col_idx, (field, header, width, hint) in enumerate(tmpl["columns"], 1):
        cell = ws.cell(row=2, column=col_idx, value=hint)
        cell.font = hint_font
        cell.fill = hint_fill
        cell.alignment = Alignment(horizontal="center", wrap_text=True)

    # Freeze panes at row 4
    ws.freeze_panes = "A4"
    return wb


@router.get("/template/{entity}")
async def download_template(
    entity: str,
    current_user: User = Depends(get_current_user),
):
    """Download an Excel template for the specified entity."""
    if entity not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {entity}. Valid: {list(TEMPLATES.keys())}")

    wb = _create_template_workbook(entity)
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"{entity}_template.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/upload/{entity}")
async def upload_excel(
    entity: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import data from an uploaded Excel file."""
    if entity not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {entity}")

    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    tmpl = TEMPLATES[entity]
    model_cls = tmpl["model"]
    field_names = [col[0] for col in tmpl["columns"]]

    try:
        content = await file.read()
        wb = load_workbook(io.BytesIO(content), read_only=True)
        ws = wb.active

        rows_imported = 0
        errors = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=4, values_only=True), start=4):
            # Skip empty rows
            if all(cell is None or str(cell).strip() == '' for cell in row):
                continue

            try:
                data = {}
                for i, field in enumerate(field_names):
                    val = row[i] if i < len(row) else None
                    if val is not None and not isinstance(val, (int, float)):
                        val = str(val).strip()
                    # Handle numeric integer fields
                    if field in ('import_lead_time_days', 'production_lead_time_days', 'year', 'month'):
                        if field == 'import_lead_time_days':
                            data[field] = int(val) if val else 30
                        elif field == 'production_lead_time_days':
                            data[field] = int(val) if val else 14
                        else:
                            data[field] = int(val) if val else None
                    # Handle numeric float fields
                    elif field in ('quantity', 'rate', 'amount', 'unit_cost', 'received_qty', 'completed_qty'):
                        data[field] = float(val) if val else 0
                    # Handle date fields
                    elif field in ('expiry_date', 'eta', 'planned_date', 'trans_date', 'demand_date'):
                        from datetime import date as date_type, datetime as dt_type
                        if isinstance(val, (date_type, dt_type)):
                            data[field] = val if isinstance(val, date_type) else val.date()
                        elif val:
                            try:
                                data[field] = dt_type.strptime(str(val)[:10], "%Y-%m-%d").date()
                            except ValueError:
                                data[field] = None
                        else:
                            data[field] = None
                    # Handle status defaults
                    elif field == 'status' and not val:
                        data[field] = 'Active'
                    elif field == 'warehouse_status' and not val:
                        data[field] = 'Active'
                    elif field == 'source' and not val:
                        data[field] = 'Excel'
                    else:
                        data[field] = val if val else None

                obj = model_cls(**data)
                db.add(obj)
                rows_imported += 1
            except Exception as e:
                errors.append(f"Row {row_idx}: {str(e)}")

        if rows_imported > 0:
            await db.flush()

        wb.close()

        return {
            "message": f"Imported {rows_imported} records",
            "rows_imported": rows_imported,
            "errors": errors[:20],  # Limit errors returned
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")
