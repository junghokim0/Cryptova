from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class StrategySetting(Base):
    __tablename__ = "strategy_settings"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)

    exchange = Column(String(50), default="Bybit", nullable=False)
    symbol = Column(String(50), default="BTCUSDT", nullable=False)

    confidence_threshold = Column(Float, default=46.0, nullable=False)
    holding_strategy = Column(String(50), default="24h Fixed", nullable=False)
    auto_trading_enabled = Column(Boolean, default=False, nullable=False)
    position_size = Column(Float, default=5.0, nullable=False)
    leverage = Column(Integer, default=10, nullable=False)
    max_drawdown_stop = Column(Float, default=-10.0, nullable=False)

    funding_threshold = Column(Float, default=0.0001, nullable=False)
    volatility_threshold = Column(Float, default=0.015, nullable=False)

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user = relationship("User")