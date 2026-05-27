from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OpenPositionResponse(BaseModel):
    id: int
    user_id: int
    signal_id: Optional[int]
    entry_order_id: Optional[int]

    exchange: str
    symbol: str
    side: str
    qty: float

    entry_price: float
    exit_price: Optional[float]

    status: str
    holding_strategy: str

    opened_at: datetime
    hold_until: datetime
    closed_at: Optional[datetime]

    is_dry_run: bool

    class Config:
        from_attributes = True


class ClosePositionRequest(BaseModel):
    symbol: str = Field(default="BTCUSDT", max_length=50)
    dry_run: bool = True


class ClosePositionResponse(BaseModel):
    position_id: int
    order_id: Optional[int]

    symbol: str
    side: str
    qty: float

    entry_price: float
    exit_price: float

    status: str
    message: str

    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None

class OpenPositionPnlResponse(BaseModel):
    symbol: str
    side: str
    qty: float

    entry_price: float
    current_price: float

    unrealized_pnl: float
    unrealized_pnl_pct: float

    status: str
    opened_at: datetime
    hold_until: datetime