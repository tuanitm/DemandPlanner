"""
Transaction ORM models: Sales, Inventory, PO, MO, Stock-In, Ad-hoc Demand.
"""
import enum
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Float, Enum, ForeignKey,
    DateTime, Date, Index, Text
)
from sqlalchemy.orm import relationship
from app.database import Base


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class OrderStatus(str, enum.Enum):
    DRAFT = "Draft"
    CONFIRMED = "Confirmed"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class StockInType(str, enum.Enum):
    SUPPLIER_RECEIPT = "Supplier Receipt"
    PRODUCTION_RECEIPT = "Production Receipt"
    OTHER_RECEIPT = "Other Receipt"


# ──────────────────────────────────────────────
# Actual Sales
# ──────────────────────────────────────────────

class ActualSales(Base):
    __tablename__ = "actual_sales"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    partner_code = Column(
        String(50),
        ForeignKey("partners.partner_code", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    quantity = Column(Float, nullable=False, default=0)
    amount = Column(Float, nullable=False, default=0)  # In VND
    source = Column(String(50), default="Manual")  # Manual / Excel / SAP
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_sales_period", "year", "month"),
        Index("ix_sales_item_wh_period", "item_code", "warehouse_code", "year", "month"),
    )


# ──────────────────────────────────────────────
# Inventory On-hand
# ──────────────────────────────────────────────

class InventoryOnhand(Base):
    __tablename__ = "inventory_onhand"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity = Column(Float, nullable=False, default=0)
    unit_cost = Column(Float, nullable=True, default=0)  # VND per unit
    mfg_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    batch_number = Column(String(100), nullable=True)  # Acts as Lot No.
    lot_status = Column(String(50), nullable=True, default="Normal")
    partner_code = Column(String(50), ForeignKey("partners.partner_code", ondelete="RESTRICT"), nullable=True)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_inv_item_wh", "item_code", "warehouse_code"),
    )


# ──────────────────────────────────────────────
# Purchase Orders
# ──────────────────────────────────────────────

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    po_number = Column(String(50), unique=True, nullable=False, index=True)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="RESTRICT"),
        nullable=True,
    )
    partner_code = Column(
        String(50),
        ForeignKey("partners.partner_code", ondelete="RESTRICT"),
        nullable=True,
    )
    quantity = Column(Float, nullable=False)
    received_qty = Column(Float, nullable=False, default=0)
    currency = Column(String(10), nullable=True, default="VND")
    unit_price = Column(Float, nullable=True, default=0)
    eta = Column(Date, nullable=True)
    status = Column(Enum(OrderStatus), default=OrderStatus.CONFIRMED, nullable=False)
    source = Column(String(50), default="Manual")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ──────────────────────────────────────────────
# Production Orders (MO)
# ──────────────────────────────────────────────

class ProductionOrder(Base):
    __tablename__ = "production_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mo_number = Column(String(50), unique=True, nullable=False, index=True)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = Column(Float, nullable=False)
    completed_qty = Column(Float, nullable=False, default=0)
    planned_date = Column(Date, nullable=True)
    status = Column(Enum(OrderStatus), default=OrderStatus.CONFIRMED, nullable=False)
    source = Column(String(50), default="Manual")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ──────────────────────────────────────────────
# Stock In Transactions
# ──────────────────────────────────────────────

class StockInTransaction(Base):
    __tablename__ = "stock_in_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trans_type = Column(Enum(StockInType), nullable=False)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = Column(Float, nullable=False)
    reference_number = Column(String(100), nullable=True)
    trans_date = Column(Date, nullable=False)
    source = Column(String(50), default="Manual")
    created_at = Column(DateTime, default=datetime.utcnow)


# ──────────────────────────────────────────────
# Ad-hoc Demand
# ──────────────────────────────────────────────

class DemandAdhoc(Base):
    __tablename__ = "demand_adhoc"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = Column(Float, nullable=False)
    demand_source = Column(String(200), nullable=True)  # Description of demand source
    demand_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
