from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AISignalCreateRequest(BaseModel):
    symbol: str = Field(default="BTCUSDT", max_length=50)
    signal: str = Field(default="LONG", pattern="^(LONG|HOLD|SHORT)$")
    confidence: float = Field(default=87.0, ge=0, le=100)
    entry_price: float = Field(default=67842.31, gt=0)

    status: str = Field(default="HOLDING", max_length=30)
    result: Optional[str] = None

    reason_summary: Optional[str] = None
    news_summary: Optional[str] = None
    chart_summary: Optional[str] = None
    filter_summary: Optional[str] = None


class AISignalResponse(BaseModel):
    id: int
    user_id: int

    symbol: str
    signal: str
    confidence: float

    entry_price: float
    status: str
    result: Optional[str]

    reason_summary: Optional[str]
    news_summary: Optional[str]
    chart_summary: Optional[str]
    filter_summary: Optional[str]

    created_at: datetime

    class Config:
        from_attributes = True