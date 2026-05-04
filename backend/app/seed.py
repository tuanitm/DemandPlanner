"""
Seed script to populate database with realistic demo data.
Run: python -m app.seed
"""
import asyncio
from app.database import engine, Base, async_session_factory
from app.models.master_data import (
    PartnerGroup, Partner, ProductHierarchy, Item,
    BillOfMaterial, Warehouse, ExchangeRate
)
from app.models.transactions import *  # noqa: F401,F403 — needed for create_all
from app.models.forecasts import *  # noqa: F401,F403 — needed for create_all
from sqlalchemy import select


async def seed():
    """Seed database with demo master data."""
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as db:
        # Check if already seeded
        result = await db.execute(select(Item).limit(1))
        if result.scalar_one_or_none():
            print("Database already seeded. Skipping.")
            return

        print("Seeding master data...")

        # ── Partner Groups ──
        partner_groups = [
            PartnerGroup(channel="Domestic", partner_grp_type="Customer", partner_grp_code="CG-DOM", partner_grp_name="Domestic Distributors", status="Active"),
            PartnerGroup(channel="Export", partner_grp_type="Customer", partner_grp_code="CG-EXP", partner_grp_name="Export Partners", status="Active"),
            PartnerGroup(channel="Modern Trade", partner_grp_type="Customer", partner_grp_code="CG-MT", partner_grp_name="Modern Trade Chains", status="Active"),
            PartnerGroup(channel="E-Commerce", partner_grp_type="Customer", partner_grp_code="CG-EC", partner_grp_name="E-Commerce Platforms", status="Active"),
            PartnerGroup(channel="Domestic", partner_grp_type="Supplier", partner_grp_code="SG-RAW", partner_grp_name="Raw Material Suppliers", status="Active"),
            PartnerGroup(channel="Domestic", partner_grp_type="Supplier", partner_grp_code="SG-PKG", partner_grp_name="Packaging Suppliers", status="Active"),
        ]
        db.add_all(partner_groups)

        # ── Partners ──
        partners = [
            Partner(partner_grp_code="CG-DOM", partner_code="BP-001", partner_name="Saigon Distribution Co.", partner_mst_code="0301234567", partner_address="123 Le Loi, District 1, HCMC", status="Active"),
            Partner(partner_grp_code="CG-DOM", partner_code="BP-002", partner_name="Hanoi Trading JSC", partner_mst_code="0107654321", partner_address="45 Trang Tien, Hoan Kiem, Hanoi", status="Active"),
            Partner(partner_grp_code="CG-DOM", partner_code="BP-003", partner_name="Mekong Delta Wholesale", partner_mst_code="1801122334", partner_address="78 30/4 Street, Can Tho", status="Active"),
            Partner(partner_grp_code="CG-MT", partner_code="BP-004", partner_name="VinMart / WinCommerce", partner_mst_code="0109876543", partner_address="72 Le Thanh Ton, District 1, HCMC", status="Active"),
            Partner(partner_grp_code="CG-MT", partner_code="BP-005", partner_name="Co.opMart", partner_mst_code="0300112233", partner_address="199C Nguyen Thi Minh Khai, District 1, HCMC", status="Active"),
            Partner(partner_grp_code="CG-EC", partner_code="BP-006", partner_name="Shopee Vietnam", partner_mst_code="0316123456", partner_address="Dreamplex Building, HCMC", status="Active"),
            Partner(partner_grp_code="CG-EC", partner_code="BP-007", partner_name="Lazada Vietnam", partner_mst_code="0315678901", partner_address="eTown Building, HCMC", status="Active"),
            Partner(partner_grp_code="CG-EXP", partner_code="BP-008", partner_name="Thai Beauty Import Co.", partner_mst_code=None, partner_address="Bangkok, Thailand", status="Active"),
            Partner(partner_grp_code="SG-RAW", partner_code="BP-009", partner_name="VietChem Materials", partner_mst_code="0302233445", partner_address="Binh Duong Industrial Zone", status="Active"),
            Partner(partner_grp_code="SG-PKG", partner_code="BP-010", partner_name="Saigon Packaging Corp", partner_mst_code="0301445566", partner_address="Thu Duc District, HCMC", status="Active"),
        ]
        db.add_all(partners)

        # ── Product Hierarchy ──
        hierarchy = [
            ProductHierarchy(business="Personal Care", brand="GlowUp", item_category_code="CAT-SC", item_category_name="Skincare", item_group_code="GRP-FACE", item_group_name="Face Care", status="Active"),
            ProductHierarchy(business="Personal Care", brand="GlowUp", item_category_code="CAT-SC", item_category_name="Skincare", item_group_code="GRP-BODY", item_group_name="Body Care", status="Active"),
            ProductHierarchy(business="Personal Care", brand="SilkLocks", item_category_code="CAT-HC", item_category_name="Haircare", item_group_code="GRP-HAIR", item_group_name="Hair Treatment", status="Active"),
            ProductHierarchy(business="Personal Care", brand="FreshSmile", item_category_code="CAT-OC", item_category_name="Oral Care", item_group_code="GRP-ORAL", item_group_name="Oral Hygiene", status="Active"),
            ProductHierarchy(business="Personal Care", brand="GlowUp", item_category_code="CAT-FR", item_category_name="Fragrance", item_group_code="GRP-FRAG", item_group_name="Personal Fragrance", status="Active"),
            ProductHierarchy(business="Health", brand="VitaPlus", item_category_code="CAT-SP", item_category_name="Supplements", item_group_code="GRP-SUPP", item_group_name="Dietary Supplements", status="Active"),
        ]
        db.add_all(hierarchy)

        # ── Items / SKUs (matching dashboard demo data) ──
        items = [
            # Finished Goods — Skincare (Face Care)
            Item(item_group_code="GRP-FACE", item_code="SKU-001", item_name="Premium Face Cream 50ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=14),
            Item(item_group_code="GRP-FACE", item_code="SKU-034", item_name="Anti-Aging Serum 30ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=14),
            Item(item_group_code="GRP-FACE", item_code="SKU-012", item_name="Vitamin C Moisturizer 50ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=14),
            Item(item_group_code="GRP-FACE", item_code="SKU-091", item_name="Sunscreen SPF50 60ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=10),
            Item(item_group_code="GRP-FACE", item_code="SKU-067", item_name="Rose Hip Oil 50ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=21),
            Item(item_group_code="GRP-FACE", item_code="SKU-102", item_name="Hyaluronic Acid Essence 40ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=14),
            # Body Care
            Item(item_group_code="GRP-BODY", item_code="SKU-089", item_name="Body Lotion Lavender 500ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=10),
            Item(item_group_code="GRP-BODY", item_code="SKU-044", item_name="Shower Gel Ocean Fresh 300ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=10),
            # Haircare
            Item(item_group_code="GRP-HAIR", item_code="SKU-078", item_name="Hair Growth Shampoo 300ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=14),
            Item(item_group_code="GRP-HAIR", item_code="SKU-045", item_name="Keratin Hair Mask 250ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=14),
            Item(item_group_code="GRP-HAIR", item_code="SKU-079", item_name="Conditioner Silk Repair 300ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=14),
            # Oral Care
            Item(item_group_code="GRP-ORAL", item_code="SKU-023", item_name="Whitening Toothpaste 150g", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=10),
            Item(item_group_code="GRP-ORAL", item_code="SKU-024", item_name="Fresh Mint Mouthwash 500ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=10),
            # Fragrance
            Item(item_group_code="GRP-FRAG", item_code="SKU-060", item_name="Eau de Toilette Blossom 100ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=21),
            Item(item_group_code="GRP-FRAG", item_code="SKU-061", item_name="Body Mist Citrus 150ml", uom="PCS", item_type="Finished Goods", status="Active", lead_time_days=14),
            # Supplements
            Item(item_group_code="GRP-SUPP", item_code="SKU-055", item_name="Collagen Supplement 60ct", uom="BOX", item_type="Finished Goods", status="Active", lead_time_days=30),
            Item(item_group_code="GRP-SUPP", item_code="SKU-056", item_name="Multivitamin Daily 90ct", uom="BOX", item_type="Finished Goods", status="Active", lead_time_days=30),
            # Raw Materials
            Item(item_group_code="GRP-FACE", item_code="RM-001", item_name="Hyaluronic Acid Powder", uom="KG", item_type="Raw Material", status="Active", lead_time_days=45),
            Item(item_group_code="GRP-FACE", item_code="RM-002", item_name="Vitamin C (Ascorbic Acid)", uom="KG", item_type="Raw Material", status="Active", lead_time_days=30),
            Item(item_group_code="GRP-FACE", item_code="RM-003", item_name="Shea Butter Organic", uom="KG", item_type="Raw Material", status="Active", lead_time_days=60),
            Item(item_group_code="GRP-HAIR", item_code="RM-004", item_name="Keratin Protein Extract", uom="KG", item_type="Raw Material", status="Active", lead_time_days=45),
            Item(item_group_code="GRP-FACE", item_code="RM-005", item_name="Rose Hip Seed Oil", uom="LT", item_type="Raw Material", status="Active", lead_time_days=30),
        ]
        db.add_all(items)

        # ── BOM ──
        bom_entries = [
            BillOfMaterial(finished_goods_item_code="SKU-001", raw_material_item_code="RM-001", quantity=0.05, uom="KG"),
            BillOfMaterial(finished_goods_item_code="SKU-001", raw_material_item_code="RM-003", quantity=0.12, uom="KG"),
            BillOfMaterial(finished_goods_item_code="SKU-012", raw_material_item_code="RM-002", quantity=0.08, uom="KG"),
            BillOfMaterial(finished_goods_item_code="SKU-012", raw_material_item_code="RM-003", quantity=0.10, uom="KG"),
            BillOfMaterial(finished_goods_item_code="SKU-067", raw_material_item_code="RM-005", quantity=0.50, uom="LT"),
            BillOfMaterial(finished_goods_item_code="SKU-045", raw_material_item_code="RM-004", quantity=0.15, uom="KG"),
        ]
        db.add_all(bom_entries)

        # ── Warehouses ──
        warehouses = [
            Warehouse(warehouse_region="South", warehouse_code="WH-HCM1", warehouse_name="HCMC Main Warehouse", warehouse_attribute="General", warehouse_status="Active"),
            Warehouse(warehouse_region="South", warehouse_code="WH-HCM2", warehouse_name="HCMC Cold Storage", warehouse_attribute="Cold Storage", warehouse_status="Active"),
            Warehouse(warehouse_region="North", warehouse_code="WH-HN1", warehouse_name="Hanoi Distribution Center", warehouse_attribute="General", warehouse_status="Active"),
            Warehouse(warehouse_region="Central", warehouse_code="WH-DN1", warehouse_name="Da Nang Warehouse", warehouse_attribute="General", warehouse_status="Active"),
            Warehouse(warehouse_region="South", warehouse_code="WH-BD1", warehouse_name="Binh Duong Factory WH", warehouse_attribute="Production", warehouse_status="Active"),
        ]
        db.add_all(warehouses)

        # ── Exchange Rates (2026) ──
        for month in range(1, 6):
            db.add(ExchangeRate(year=2026, month=month, from_currency="VND", to_currency="USD", rate=25385 + (month * 15)))
            db.add(ExchangeRate(year=2026, month=month, from_currency="VND", to_currency="EUR", rate=27450 + (month * 20)))

        await db.flush()

        # ══════════════════════════════════════════════
        # Transaction Data (Phase 2)
        # ══════════════════════════════════════════════
        from app.models.transactions import (
            ActualSales, InventoryOnhand, PurchaseOrder,
            ProductionOrder, StockInTransaction, DemandAdhoc
        )
        from datetime import date
        import random

        random.seed(42)

        print("Seeding transaction data...")

        # ── Actual Sales (12 months of history) ──
        sku_codes = ["SKU-001", "SKU-034", "SKU-012", "SKU-091", "SKU-067",
                     "SKU-102", "SKU-089", "SKU-044", "SKU-078", "SKU-045",
                     "SKU-079", "SKU-023", "SKU-024", "SKU-060", "SKU-061",
                     "SKU-055", "SKU-056"]
        wh_codes = ["WH-HCM1", "WH-HN1", "WH-DN1"]
        bp_codes = ["BP-001", "BP-002", "BP-003", "BP-004", "BP-005"]

        base_qty = {
            "SKU-001": 850, "SKU-034": 620, "SKU-012": 780, "SKU-091": 1200,
            "SKU-067": 350, "SKU-102": 450, "SKU-089": 900, "SKU-044": 1100,
            "SKU-078": 550, "SKU-045": 400, "SKU-079": 480, "SKU-023": 2200,
            "SKU-024": 1500, "SKU-060": 200, "SKU-061": 380, "SKU-055": 300,
            "SKU-056": 250,
        }
        unit_price = {
            "SKU-001": 350000, "SKU-034": 520000, "SKU-012": 280000, "SKU-091": 195000,
            "SKU-067": 450000, "SKU-102": 385000, "SKU-089": 165000, "SKU-044": 125000,
            "SKU-078": 210000, "SKU-045": 285000, "SKU-079": 195000, "SKU-023": 65000,
            "SKU-024": 89000, "SKU-060": 890000, "SKU-061": 245000, "SKU-055": 650000,
            "SKU-056": 420000,
        }

        sales_records = []
        for year in [2025, 2026]:
            month_range = range(1, 13) if year == 2025 else range(1, 5)
            for month in month_range:
                for sku in sku_codes[:12]:  # Top 12 SKUs
                    for wh in wh_codes[:2]:  # 2 main warehouses
                        seasonality = 1.0 + 0.15 * (1 if month in [11, 12, 1, 2] else (-0.1 if month in [6, 7, 8] else 0))
                        qty = int(base_qty.get(sku, 500) * seasonality * random.uniform(0.7, 1.3) / 3)
                        amt = qty * unit_price.get(sku, 200000)
                        partner = random.choice(bp_codes)
                        sales_records.append(ActualSales(
                            item_code=sku, warehouse_code=wh, partner_code=partner,
                            year=year, month=month, quantity=qty, amount=amt, source="SAP"
                        ))
        db.add_all(sales_records)

        # ── Inventory On-hand (current snapshot) ──
        inv_records = []
        for sku in sku_codes:
            for wh in wh_codes:
                qty = int(base_qty.get(sku, 500) * random.uniform(0.3, 1.2))
                cost = unit_price.get(sku, 200000) * 0.6
                exp = date(2026, random.randint(7, 12), 15) if random.random() > 0.3 else None
                batch = f"B{random.randint(2025, 2026)}{random.randint(100, 999)}" if random.random() > 0.4 else None
                inv_records.append(InventoryOnhand(
                    item_code=sku, warehouse_code=wh, quantity=qty,
                    unit_cost=cost, expiry_date=exp, batch_number=batch
                ))
        db.add_all(inv_records)

        # ── Purchase Orders ──
        po_records = []
        rm_codes = ["RM-001", "RM-002", "RM-003", "RM-004", "RM-005"]
        po_statuses = ["Confirmed", "In Progress", "Completed", "Completed", "Completed"]
        for i, rm in enumerate(rm_codes):
            for j in range(3):
                po_num = f"PO-2026-{(i*3+j+1):03d}"
                qty = random.randint(50, 500) * 10
                recv = qty if po_statuses[j % 5] == "Completed" else int(qty * random.uniform(0, 0.6))
                eta = date(2026, min(12, random.randint(4, 8)), random.randint(1, 28))
                po_records.append(PurchaseOrder(
                    po_number=po_num, item_code=rm, warehouse_code="WH-BD1",
                    partner_code="BP-009", quantity=qty, received_qty=recv,
                    eta=eta, status=po_statuses[j % 5], source="SAP"
                ))
        # Also some FG POs
        for i, sku in enumerate(["SKU-055", "SKU-056"]):
            po_records.append(PurchaseOrder(
                po_number=f"PO-2026-{20+i:03d}", item_code=sku, warehouse_code="WH-HCM1",
                partner_code="BP-010", quantity=random.randint(100, 500),
                received_qty=0, eta=date(2026, 6, 15), status="Confirmed", source="SAP"
            ))
        db.add_all(po_records)

        # ── Production Orders ──
        mo_records = []
        fg_codes = ["SKU-001", "SKU-012", "SKU-034", "SKU-091", "SKU-089", "SKU-044"]
        mo_statuses = ["Completed", "Completed", "In Progress", "Confirmed", "Confirmed"]
        for i, sku in enumerate(fg_codes):
            for j in range(2):
                mo_num = f"MO-2026-{(i*2+j+1):03d}"
                qty = random.randint(200, 1500)
                comp = qty if mo_statuses[j % 5] == "Completed" else int(qty * random.uniform(0, 0.4))
                pdate = date(2026, min(12, 3 + i), random.randint(1, 28))
                mo_records.append(ProductionOrder(
                    mo_number=mo_num, item_code=sku, warehouse_code="WH-BD1",
                    quantity=qty, completed_qty=comp, planned_date=pdate,
                    status=mo_statuses[j % 5], source="SAP"
                ))
        db.add_all(mo_records)

        # ── Stock-In Transactions ──
        stockin_records = []
        for i in range(15):
            stype = random.choice(["Supplier Receipt", "Production Receipt", "Other Receipt"])
            sku = random.choice(sku_codes + rm_codes)
            wh = random.choice(wh_codes + ["WH-BD1"])
            ref = f"PO-2026-{random.randint(1, 20):03d}" if stype == "Supplier Receipt" else f"MO-2026-{random.randint(1, 12):03d}"
            stockin_records.append(StockInTransaction(
                trans_type=stype, item_code=sku, warehouse_code=wh,
                quantity=random.randint(50, 2000),
                reference_number=ref,
                trans_date=date(2026, random.randint(1, 4), random.randint(1, 28)),
                source="SAP"
            ))
        db.add_all(stockin_records)

        # ── Ad-hoc Demand ──
        adhoc_records = [
            DemandAdhoc(item_code="SKU-001", warehouse_code="WH-HCM1", quantity=500,
                        demand_source="Tet Holiday Promotion", demand_date=date(2026, 1, 15),
                        notes="Special order for Tet gift sets"),
            DemandAdhoc(item_code="SKU-091", warehouse_code="WH-HN1", quantity=300,
                        demand_source="Summer Campaign", demand_date=date(2026, 6, 1),
                        notes="Sunscreen promotion for summer season"),
            DemandAdhoc(item_code="SKU-034", warehouse_code="WH-HCM1", quantity=200,
                        demand_source="VinMart Anniversary Event", demand_date=date(2026, 5, 10),
                        notes="Exclusive pack for VinMart stores"),
        ]
        db.add_all(adhoc_records)

        await db.commit()
        n_sales = len(sales_records)
        n_inv = len(inv_records)
        n_po = len(po_records)
        n_mo = len(mo_records)
        n_si = len(stockin_records)
        n_ad = len(adhoc_records)
        print(f"DONE - Seeded: 6 partner groups, 10 partners, 6 product hierarchy, 22 items, 6 BOM entries, 5 warehouses, 10 exchange rates")
        print(f"  Transactions: {n_sales} sales, {n_inv} inventory, {n_po} POs, {n_mo} MOs, {n_si} stock-in, {n_ad} ad-hoc")


if __name__ == "__main__":
    asyncio.run(seed())
