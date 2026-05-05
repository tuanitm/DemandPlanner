"""
Master Data ORM models: Partners, Products, Warehouses, BOM, Exchange Rates, System Config.
"""
import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Enum, ForeignKey,
    DateTime, Boolean, UniqueConstraint, Index, Text
)
from sqlalchemy.orm import relationship
from app.database import Base


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class ChannelType(str, enum.Enum):
    DOMESTIC = "Domestic"
    EXPORT = "Export"
    ECOMMERCE = "E-Commerce"
    MODERN_TRADE = "Modern Trade"
    GENERAL_TRADE = "General Trade"
    OTHER = "Other"


class PartnerGroupType(str, enum.Enum):
    CUSTOMER = "Customer"
    SUPPLIER = "Supplier"


class ItemType(str, enum.Enum):
    GOODS = "Goods"
    FINISHED_GOODS = "Finished Goods"
    SEMI_FINISHED_GOODS = "Semi-Finished Goods"
    RAW_MATERIAL = "Raw Material"


class StatusType(str, enum.Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"


# ──────────────────────────────────────────────
# Business Partner Groups
# ──────────────────────────────────────────────

class PartnerGroup(Base):
    __tablename__ = "partner_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    channel = Column(Enum(ChannelType), nullable=False)
    partner_grp_type = Column(Enum(PartnerGroupType), nullable=False)
    partner_grp_code = Column(String(50), unique=True, nullable=False, index=True)
    partner_grp_name = Column(String(200), nullable=False)
    status = Column(Enum(StatusType), default=StatusType.ACTIVE, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    partners = relationship("Partner", back_populates="group", lazy="selectin")


# ──────────────────────────────────────────────
# Business Partners
# ──────────────────────────────────────────────

class Partner(Base):
    __tablename__ = "partners"

    id = Column(Integer, primary_key=True, autoincrement=True)
    partner_grp_code = Column(
        String(50),
        ForeignKey("partner_groups.partner_grp_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    partner_code = Column(String(50), unique=True, nullable=False, index=True)
    partner_name = Column(String(300), nullable=False)
    partner_mst_code = Column(String(50), nullable=True)
    partner_address = Column(Text, nullable=True)
    status = Column(Enum(StatusType), default=StatusType.ACTIVE, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    group = relationship("PartnerGroup", back_populates="partners", lazy="selectin")


# ──────────────────────────────────────────────
# Product Hierarchy
# ──────────────────────────────────────────────

class ProductHierarchy(Base):
    __tablename__ = "product_hierarchy"

    id = Column(Integer, primary_key=True, autoincrement=True)
    business = Column(String(100), nullable=False, index=True)  # FMCG, Cosmetic, etc.
    brand = Column(String(100), nullable=False, index=True)
    item_category_code = Column(String(50), nullable=False, index=True)
    item_category_name = Column(String(200), nullable=False)
    item_group_code = Column(String(50), unique=True, nullable=False, index=True)
    item_group_name = Column(String(200), nullable=False)
    status = Column(Enum(StatusType), default=StatusType.ACTIVE, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    items = relationship("Item", back_populates="product_hierarchy", lazy="selectin")


# ──────────────────────────────────────────────
# Items / SKUs
# ──────────────────────────────────────────────

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_group_code = Column(
        String(50),
        ForeignKey("product_hierarchy.item_group_code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    item_code = Column(String(50), unique=True, nullable=False, index=True)
    item_partner_code = Column(String(100), nullable=True)
    item_name = Column(String(500), nullable=False)
    item_for_name = Column(String(500), nullable=True)
    uom = Column(String(20), nullable=False)  # Unit of Measure
    item_type = Column(Enum(ItemType), nullable=False, index=True)
    status = Column(Enum(StatusType), default=StatusType.ACTIVE, nullable=False)
    import_lead_time_days = Column(Integer, default=30)  # Lead time for PO (import/purchase)
    production_lead_time_days = Column(Integer, default=14)  # Lead time for MO (production)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    product_hierarchy = relationship("ProductHierarchy", back_populates="items", lazy="selectin")
    bom_parent = relationship(
        "BillOfMaterial",
        foreign_keys="BillOfMaterial.finished_goods_item_code",
        back_populates="finished_goods",
        lazy="selectin",
    )
    bom_child = relationship(
        "BillOfMaterial",
        foreign_keys="BillOfMaterial.raw_material_item_code",
        back_populates="raw_material",
        lazy="selectin",
    )


# ──────────────────────────────────────────────
# Bill of Material (BOM)
# ──────────────────────────────────────────────

class BillOfMaterial(Base):
    __tablename__ = "bill_of_materials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    finished_goods_item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    raw_material_item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(Float, nullable=False)  # Qty of RM per 1 unit of FG
    uom = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("finished_goods_item_code", "raw_material_item_code", name="uq_bom_fg_rm"),
    )

    # Relationships
    finished_goods = relationship(
        "Item",
        foreign_keys=[finished_goods_item_code],
        back_populates="bom_parent",
        lazy="selectin",
    )
    raw_material = relationship(
        "Item",
        foreign_keys=[raw_material_item_code],
        back_populates="bom_child",
        lazy="selectin",
    )


# ──────────────────────────────────────────────
# Warehouses
# ──────────────────────────────────────────────

class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    warehouse_region = Column(String(100), nullable=False, index=True)
    warehouse_code = Column(String(50), unique=True, nullable=False, index=True)
    warehouse_name = Column(String(300), nullable=False)
    warehouse_attribute = Column(String(200), nullable=True)
    warehouse_status = Column(Enum(StatusType), default=StatusType.ACTIVE, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ──────────────────────────────────────────────
# Exchange Rates (Monthly user input)
# ──────────────────────────────────────────────

class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    from_currency = Column(String(3), nullable=False, default="VND")
    to_currency = Column(String(3), nullable=False)
    rate = Column(Float, nullable=False)  # 1 from_currency = rate to_currency
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("year", "month", "from_currency", "to_currency", name="uq_exchange_rate"),
        Index("ix_exchange_rate_period", "year", "month"),
    )


# ──────────────────────────────────────────────
# System Configuration (Configurable thresholds)
# ──────────────────────────────────────────────

class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    config_key = Column(String(100), unique=True, nullable=False, index=True)
    config_value = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
