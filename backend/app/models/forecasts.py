"""
Forecast ORM models: Results, Accuracy, Supply Recommendations.
"""
import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Enum, ForeignKey,
    DateTime, Index, Text
)
from sqlalchemy.orm import relationship
from app.database import Base


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class ModelType(str, enum.Enum):
    PROPHET = "Prophet"
    ARIMA = "ARIMA"
    XGBOOST = "XGBoost"
    LSTM = "LSTM"
    BAYESIAN = "Bayesian"
    ENSEMBLE = "Ensemble"


class RecommendationType(str, enum.Enum):
    PURCHASE_ORDER = "Purchase Order"
    PRODUCTION_ORDER = "Production Order"
    RM_PURCHASE = "RM Purchase"


class RiskLevel(str, enum.Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"


# ──────────────────────────────────────────────
# Forecast Results
# ──────────────────────────────────────────────

class ForecastResult(Base):
    __tablename__ = "forecast_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    model_type = Column(Enum(ModelType), nullable=False)
    forecast_qty = Column(Float, nullable=False)
    confidence_lower = Column(Float, nullable=True)
    confidence_upper = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Manual adjustment fields (planner overrides)
    adjusted_qty = Column(Float, nullable=True)  # NULL = no adjustment
    adjusted_by = Column(String(100), nullable=True)
    adjusted_at = Column(DateTime, nullable=True)
    adjustment_reason = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_forecast_item_wh_period", "item_code", "warehouse_code", "year", "month"),
        Index("ix_forecast_model", "model_type"),
    )


# ──────────────────────────────────────────────
# Forecast Accuracy
# ──────────────────────────────────────────────

class ForecastAccuracy(Base):
    __tablename__ = "forecast_accuracy"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    forecast_qty = Column(Float, nullable=False)
    actual_qty = Column(Float, nullable=False)
    fa_percent = Column(Float, nullable=False)  # FA% = 1 - |Forecast - Actual| / Actual
    model_type = Column(Enum(ModelType), nullable=False, default=ModelType.ENSEMBLE)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_accuracy_item_period", "item_code", "year", "month"),
    )


# ──────────────────────────────────────────────
# Supply Recommendations
# ──────────────────────────────────────────────

class SupplyRecommendation(Base):
    __tablename__ = "supply_recommendations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(
        String(50),
        ForeignKey("items.item_code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recommendation_type = Column(Enum(RecommendationType), nullable=False)
    forecast_qty = Column(Float, nullable=False)
    safety_stock_qty = Column(Float, nullable=False, default=0)
    onhand_qty = Column(Float, nullable=False, default=0)
    incoming_supply_qty = Column(Float, nullable=False, default=0)
    suggested_qty = Column(Float, nullable=False)
    target_month = Column(Integer, nullable=False)
    target_year = Column(Integer, nullable=False)
    shortage_risk = Column(Enum(RiskLevel), default=RiskLevel.LOW)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_recom_item_period", "item_code", "target_year", "target_month"),
    )


# ──────────────────────────────────────────────
# User & Auth
# ──────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "Admin"
    PLANNER = "Planner"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(200), unique=True, nullable=False)
    hashed_password = Column(String(500), nullable=False)
    full_name = Column(String(300), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.PLANNER)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Data permissions
    permissions = relationship("UserPermission", back_populates="user", lazy="selectin")


class UserPermission(Base):
    """
    Row-level data permission per user.
    Dimension: customer_group | product_brand | product_group | warehouse
    """
    __tablename__ = "user_permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dimension = Column(String(50), nullable=False)  # customer_group | product_brand | product_group | warehouse
    dimension_value = Column(String(200), nullable=False)  # The allowed value

    user = relationship("User", back_populates="permissions")

    __table_args__ = (
        Index("ix_perm_user_dim", "user_id", "dimension"),
    )
