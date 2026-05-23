from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class AISignal(Base):
    __tablename__ = "ai_signals"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    symbol = Column(String(50), default="BTCUSDT", nullable=False)
    signal = Column(String(20), nullable=False)  # LONG, HOLD, SHORT
    confidence = Column(Float, nullable=False)

    entry_price = Column(Float, nullable=False)
    status = Column(String(30), default="HOLDING", nullable=False)  # HOLDING, CLOSED, STOPPED
    result = Column(String(30), nullable=True)

    reason_summary = Column(Text, nullable=True)
    news_summary = Column(Text, nullable=True)
    chart_summary = Column(Text, nullable=True)
    filter_summary = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")