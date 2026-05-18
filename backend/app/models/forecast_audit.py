"""
Forecast Audit Log — tracks every manual adjustment to forecast results.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Index
from app.database import Base


class ForecastAuditLog(Base):
    __tablename__ = "forecast_audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    forecast_id = Column(
        Integer,
        ForeignKey("forecast_results.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_code = Column(String(50), nullable=False)
    warehouse_code = Column(String(50), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)

    original_qty = Column(Float, nullable=False)
    previous_adjusted_qty = Column(Float, nullable=True)  # NULL if first edit
    new_adjusted_qty = Column(Float, nullable=False)

    adjusted_by = Column(String(100), nullable=False)
    adjustment_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_audit_forecast_id", "forecast_id"),
        Index("ix_audit_item_period", "item_code", "year", "month"),
    )
