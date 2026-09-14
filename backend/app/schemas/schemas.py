"""
Pydantic schemas for API request/response validation.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date
from enum import Enum


# ──────────────────────────────────────────────
# Enums (mirror ORM enums for API)
# ──────────────────────────────────────────────

class ChannelTypeEnum(str, Enum):
    DOMESTIC = "Domestic"
    EXPORT = "Export"
    ECOMMERCE = "E-Commerce"
    MODERN_TRADE = "Modern Trade"
    GENERAL_TRADE = "General Trade"
    OTHER = "Other"

class PartnerGroupTypeEnum(str, Enum):
    CUSTOMER = "Customer"
    SUPPLIER = "Supplier"

class ItemTypeEnum(str, Enum):
    GOODS = "Goods"
    FINISHED_GOODS = "Finished Goods"
    SEMI_FINISHED_GOODS = "Semi-Finished Goods"
    RAW_MATERIAL = "Raw Material"

class ItemAttributeEnum(str, Enum):
    NORMAL = "Normal"
    FAST_MOVING = "Fast-Moving"
    SLOW_MOVING = "Slow-Moving"

class StatusEnum(str, Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"

class OrderStatusEnum(str, Enum):
    DRAFT = "Draft"
    CONFIRMED = "Confirmed"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"

class StockInTypeEnum(str, Enum):
    SUPPLIER_RECEIPT = "Supplier Receipt"
    PRODUCTION_RECEIPT = "Production Receipt"
    OTHER_RECEIPT = "Other Receipt"

class UserRoleEnum(str, Enum):
    ADMIN = "Admin"
    PLANNER = "Planner"


# ──────────────────────────────────────────────
# Partner Group
# ──────────────────────────────────────────────

class PartnerGroupBase(BaseModel):
    channel: str = Field(..., max_length=100)
    partner_grp_type: PartnerGroupTypeEnum
    partner_grp_code: str = Field(..., max_length=50)
    partner_grp_name: str = Field(..., max_length=200)
    status: StatusEnum = StatusEnum.ACTIVE

class PartnerGroupCreate(PartnerGroupBase):
    pass

class PartnerGroupUpdate(BaseModel):
    channel: Optional[str] = Field(None, max_length=100)
    partner_grp_type: Optional[PartnerGroupTypeEnum] = None
    partner_grp_name: Optional[str] = None
    status: Optional[StatusEnum] = None

class PartnerGroupResponse(PartnerGroupBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Partner
# ──────────────────────────────────────────────

class PartnerBase(BaseModel):
    partner_grp_code: str = Field(..., max_length=50)
    partner_code: str = Field(..., max_length=50)
    partner_name: str = Field(..., max_length=300)
    partner_mst_code: Optional[str] = None
    partner_address: Optional[str] = None
    status: StatusEnum = StatusEnum.ACTIVE

class PartnerCreate(PartnerBase):
    pass

class PartnerUpdate(BaseModel):
    partner_grp_code: Optional[str] = None
    partner_name: Optional[str] = None
    partner_mst_code: Optional[str] = None
    partner_address: Optional[str] = None
    status: Optional[StatusEnum] = None

class PartnerResponse(PartnerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Product Hierarchy
# ──────────────────────────────────────────────

class ProductHierarchyBase(BaseModel):
    business: str = Field(..., max_length=100)
    brand: str = Field(..., max_length=100)
    item_category_code: str = Field(..., max_length=50)
    item_category_name: str = Field(..., max_length=200)
    item_group_code: str = Field(..., max_length=50)
    item_group_name: str = Field(..., max_length=200)
    status: StatusEnum = StatusEnum.ACTIVE

class ProductHierarchyCreate(ProductHierarchyBase):
    pass

class ProductHierarchyUpdate(BaseModel):
    business: Optional[str] = None
    brand: Optional[str] = None
    item_category_code: Optional[str] = None
    item_category_name: Optional[str] = None
    item_group_name: Optional[str] = None
    status: Optional[StatusEnum] = None

class ProductHierarchyResponse(ProductHierarchyBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Item / SKU
# ──────────────────────────────────────────────

class ItemBase(BaseModel):
    item_group_code: str = Field(..., max_length=50)
    item_code: str = Field(..., max_length=50)
    item_partner_code: Optional[str] = None
    item_name: str = Field(..., max_length=500)
    item_for_name: Optional[str] = None
    uom: str = Field(..., max_length=20)
    item_type: ItemTypeEnum
    item_attribute: Optional[ItemAttributeEnum] = None
    status: StatusEnum = StatusEnum.ACTIVE
    import_lead_time_days: int = 30
    production_lead_time_days: int = 14
    shelf_life_days: Optional[int] = None

class ItemCreate(ItemBase):
    pass

class ItemUpdate(BaseModel):
    item_group_code: Optional[str] = None
    item_partner_code: Optional[str] = None
    item_name: Optional[str] = None
    item_for_name: Optional[str] = None
    uom: Optional[str] = None
    item_type: Optional[ItemTypeEnum] = None
    item_attribute: Optional[ItemAttributeEnum] = None
    status: Optional[StatusEnum] = None
    import_lead_time_days: Optional[int] = None
    production_lead_time_days: Optional[int] = None
    shelf_life_days: Optional[int] = None

class ItemResponse(ItemBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# BOM
# ──────────────────────────────────────────────

class BOMBase(BaseModel):
    finished_goods_item_code: str
    raw_material_item_code: str
    quantity: float
    uom: str

class BOMCreate(BOMBase):
    pass

class BOMResponse(BOMBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Warehouse
# ──────────────────────────────────────────────

class WarehouseBase(BaseModel):
    warehouse_region: str = Field(..., max_length=100)
    warehouse_code: str = Field(..., max_length=50)
    warehouse_name: str = Field(..., max_length=300)
    warehouse_attribute: Optional[str] = None
    warehouse_status: StatusEnum = StatusEnum.ACTIVE

class WarehouseCreate(WarehouseBase):
    pass

class WarehouseUpdate(BaseModel):
    warehouse_region: Optional[str] = None
    warehouse_name: Optional[str] = None
    warehouse_attribute: Optional[str] = None
    warehouse_status: Optional[StatusEnum] = None

class WarehouseResponse(WarehouseBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Channel
# ──────────────────────────────────────────────

class ChannelBase(BaseModel):
    channel_code: str = Field(..., max_length=50)
    channel_name: str = Field(..., max_length=200)
    status: StatusEnum = StatusEnum.ACTIVE

class ChannelCreate(ChannelBase):
    pass

class ChannelUpdate(BaseModel):
    channel_name: Optional[str] = None
    status: Optional[StatusEnum] = None

class ChannelResponse(ChannelBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Region
# ──────────────────────────────────────────────

class RegionBase(BaseModel):
    region_code: str = Field(..., max_length=50)
    region_name: str = Field(..., max_length=200)
    status: StatusEnum = StatusEnum.ACTIVE

class RegionCreate(RegionBase):
    pass

class RegionUpdate(BaseModel):
    region_name: Optional[str] = None
    status: Optional[StatusEnum] = None

class RegionResponse(RegionBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Brand
# ──────────────────────────────────────────────

class BrandBase(BaseModel):
    brand_code: str = Field(..., max_length=50)
    brand_name: str = Field(..., max_length=200)
    status: StatusEnum = StatusEnum.ACTIVE

class BrandCreate(BrandBase):
    pass

class BrandUpdate(BaseModel):
    brand_name: Optional[str] = Field(None, max_length=200)
    status: Optional[StatusEnum] = None

class BrandResponse(BrandBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Exchange Rate
# ──────────────────────────────────────────────

class ExchangeRateBase(BaseModel):
    year: int
    month: int = Field(..., ge=1, le=12)
    from_currency: str = "VND"
    to_currency: str
    rate: float

class ExchangeRateCreate(ExchangeRateBase):
    pass

class ExchangeRateResponse(ExchangeRateBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Actual Sales
# ──────────────────────────────────────────────

class ActualSalesBase(BaseModel):
    item_code: str
    warehouse_code: Optional[str] = None
    partner_code: Optional[str] = None
    year: int
    month: int = Field(..., ge=1, le=12)
    quantity: float
    amount: float = 0
    source: str = "Manual"

class ActualSalesCreate(ActualSalesBase):
    pass

class ActualSalesResponse(ActualSalesBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Inventory
# ──────────────────────────────────────────────

class InventoryBase(BaseModel):
    item_code: str
    warehouse_code: str
    quantity: float
    unit_cost: Optional[float] = 0
    mfg_date: Optional[date] = None
    expiry_date: Optional[date] = None
    batch_number: Optional[str] = None
    lot_status: Optional[str] = "Normal"
    partner_code: Optional[str] = None

class InventoryCreate(InventoryBase):
    pass

class InventoryResponse(InventoryBase):
    id: int
    last_updated: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Purchase Order
# ──────────────────────────────────────────────

class PurchaseOrderBase(BaseModel):
    po_number: str
    item_code: str
    warehouse_code: Optional[str] = None
    partner_code: Optional[str] = None
    quantity: float
    received_qty: float = 0
    currency: Optional[str] = "VND"
    unit_price: Optional[float] = 0
    eta: Optional[date] = None
    status: OrderStatusEnum = OrderStatusEnum.CONFIRMED
    source: str = "Manual"

class PurchaseOrderCreate(PurchaseOrderBase):
    @field_validator('quantity')
    @classmethod
    def quantity_must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError('Quantity must be greater than 0')
        return v

    @field_validator('unit_price')
    @classmethod
    def unit_price_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError('Unit price must not be negative')
        return v

class PurchaseOrderResponse(PurchaseOrderBase):
    id: int
    product_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Production Order
# ──────────────────────────────────────────────

class ProductionOrderBase(BaseModel):
    mo_number: str
    item_code: str
    warehouse_code: str
    quantity: float
    completed_qty: float = 0
    planned_date: Optional[date] = None
    status: OrderStatusEnum = OrderStatusEnum.CONFIRMED
    source: str = "Manual"

class ProductionOrderCreate(ProductionOrderBase):
    @field_validator('quantity')
    @classmethod
    def quantity_must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError('Quantity must be greater than 0')
        return v

class ProductionOrderResponse(ProductionOrderBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Stock In Transaction
# ──────────────────────────────────────────────

class StockInBase(BaseModel):
    trans_type: StockInTypeEnum
    item_code: str
    warehouse_code: str
    quantity: float
    reference_number: Optional[str] = None
    trans_date: date
    source: str = "Manual"

class StockInCreate(StockInBase):
    pass

class StockInResponse(StockInBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Ad-hoc Demand
# ──────────────────────────────────────────────

class DemandAdhocBase(BaseModel):
    item_code: str
    warehouse_code: str
    quantity: float
    demand_source: Optional[str] = None
    demand_date: date
    notes: Optional[str] = None

class DemandAdhocCreate(DemandAdhocBase):
    pass

class DemandAdhocResponse(DemandAdhocBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Auth
# ──────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(..., max_length=100)
    email: str = Field(..., max_length=200)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., max_length=300)
    role: UserRoleEnum = UserRoleEnum.PLANNER

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: UserRoleEnum
    is_active: int
    created_at: datetime
    class Config:
        from_attributes = True

class UserPermissionCreate(BaseModel):
    user_id: int
    dimension: str  # customer_group | product_brand | product_group | warehouse
    dimension_value: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LoginRequest(BaseModel):
    username: str
    password: str


# ──────────────────────────────────────────────
# Forecast
# ──────────────────────────────────────────────

class ForecastGenerateRequest(BaseModel):
    item_codes: Optional[List[str]] = None  # None = all items
    warehouse_codes: Optional[List[str]] = None
    horizon_months: int = 6
    start_year: Optional[int] = None
    start_month: Optional[int] = None

class ForecastResultResponse(BaseModel):
    id: int
    item_code: str
    warehouse_code: str
    year: int
    month: int
    model_type: str
    forecast_qty: float
    confidence_lower: Optional[float]
    confidence_upper: Optional[float]
    adjusted_qty: Optional[float] = None
    adjusted_by: Optional[str] = None
    adjusted_at: Optional[datetime] = None
    adjustment_reason: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class SupplyRecommendationResponse(BaseModel):
    id: int
    item_code: str
    warehouse_code: str
    recommendation_type: str
    forecast_qty: float
    safety_stock_qty: float
    onhand_qty: float
    incoming_supply_qty: float
    suggested_qty: float
    target_month: int
    target_year: int
    shortage_risk: str
    notes: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Forecast Editing
# ──────────────────────────────────────────────

class ForecastEditRequest(BaseModel):
    """Edit a single forecast record."""
    forecast_id: int
    adjusted_qty: float = Field(..., ge=0, description="Adjusted forecast quantity")
    adjustment_reason: Optional[str] = Field(None, max_length=1000)

class ForecastBulkEditRequest(BaseModel):
    """Edit multiple forecast records at once."""
    edits: List[ForecastEditRequest] = Field(..., min_length=1, max_length=200)

class ForecastRevertRequest(BaseModel):
    """Revert a forecast adjustment back to the original model value."""
    forecast_id: int

class ForecastBulkRevertRequest(BaseModel):
    """Revert multiple forecast adjustments."""
    forecast_ids: List[int] = Field(..., min_length=1, max_length=200)

class ForecastAuditLogResponse(BaseModel):
    id: int
    forecast_id: int
    item_code: str
    warehouse_code: str
    year: int
    month: int
    original_qty: float
    previous_adjusted_qty: Optional[float]
    new_adjusted_qty: float
    adjusted_by: str
    adjustment_reason: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True



# ──────────────────────────────────────────────
# Sales Forecast (Planning Spreadsheet)
# ──────────────────────────────────────────────

class SalesForecastBase(BaseModel):
    year: int
    brand: str = Field("", max_length=100)
    product_group: str = Field("", max_length=200)
    sku_code: str = Field(..., max_length=50)
    sku_name: str = Field("", max_length=500)
    unit: str = Field("PCS", max_length=20)
    channel: str = Field("", max_length=100)
    region: str = Field("", max_length=100)
    jan: float = 0
    feb: float = 0
    mar: float = 0
    apr: float = 0
    may: float = 0
    jun: float = 0
    jul: float = 0
    aug: float = 0
    sep: float = 0
    oct: float = 0
    nov: float = 0
    dec: float = 0

class SalesForecastCreate(SalesForecastBase):
    pass

class SalesForecastUpdate(BaseModel):
    brand: Optional[str] = None
    product_group: Optional[str] = None
    sku_name: Optional[str] = None
    unit: Optional[str] = None
    channel: Optional[str] = None
    region: Optional[str] = None
    jan: Optional[float] = None
    feb: Optional[float] = None
    mar: Optional[float] = None
    apr: Optional[float] = None
    may: Optional[float] = None
    jun: Optional[float] = None
    jul: Optional[float] = None
    aug: Optional[float] = None
    sep: Optional[float] = None
    oct: Optional[float] = None
    nov: Optional[float] = None
    dec: Optional[float] = None

class SalesForecastResponse(SalesForecastBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Sales Entry (Actual Sales Planning Grid)
# ──────────────────────────────────────────────

# Reuse the same field structure as SalesForecast
SalesEntryCreate = SalesForecastCreate
SalesEntryUpdate = SalesForecastUpdate

class SalesEntryResponse(SalesForecastBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Generic
# ──────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int

class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None
