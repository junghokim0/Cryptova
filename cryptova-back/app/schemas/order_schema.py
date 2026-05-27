from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OrderExecuteRequest(BaseModel):
    signal_id: Optional[int] = None
    symbol: str = Field(default="BTCUSDT", max_length=50)

    # True면 실제 주문 안 나감. 처음 테스트할 때는 반드시 True 추천.
    dry_run: bool = True


class OrderExecuteResponse(BaseModel):
    id: int
    user_id: int
    signal_id: Optional[int]

    exchange: str
    symbol: str

    signal: str
    side: Optional[str]

    order_type: str
    qty: float
    entry_price: float

    status: str
    bybit_order_id: Optional[str]
    message: Optional[str]

    created_at: datetime

    class Config:
        from_attributes = True