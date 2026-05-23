from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base


class BacktestResult(Base):
    __tablename__ = "backtest_results"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    symbol = Column(String(50), default="BTCUSDT", nullable=False)
    start_date = Column(String(20), nullable=False)
    end_date = Column(String(20), nullable=False)

    confidence_threshold = Column(Float, nullable=False)
    position_size = Column(Float, nullable=False)
    max_drawdown_stop = Column(Float, nullable=False)

    total_return = Column(Float, nullable=False)
    cagr = Column(Float, nullable=False)
    sharpe = Column(Float, nullable=False)
    mdd = Column(Float, nullable=False)
    win_rate = Column(Float, nullable=False)
    trade_count = Column(Integer, nullable=False)

    result_json = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")