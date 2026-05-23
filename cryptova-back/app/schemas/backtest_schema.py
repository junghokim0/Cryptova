from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class BacktestRunRequest(BaseModel):
    symbol: str = Field(default="BTCUSDT", max_length=50)
    start_date: str
    end_date: str

    confidence_threshold: float = Field(..., ge=50, le=90)
    position_size: float = Field(..., ge=0, le=100)
    max_drawdown_stop: float = Field(..., ge=-30, le=-5)


class BacktestResultResponse(BaseModel):
    id: int
    user_id: int

    symbol: str
    start_date: str
    end_date: str

    confidence_threshold: float
    position_size: float
    max_drawdown_stop: float

    total_return: float
    cagr: float
    sharpe: float
    mdd: float
    win_rate: float
    trade_count: int

    result_json: Optional[dict[str, Any]] = None

    created_at: datetime

    class Config:
        from_attributes = True