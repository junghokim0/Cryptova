from datetime import datetime

from pydantic import BaseModel, Field


class StrategySettingRequest(BaseModel):
    exchange: str = Field(default="Bybit", max_length=50)
    symbol: str = Field(default="BTCUSDT", max_length=50)

    confidence_threshold: float = Field(..., ge=50, le=90)
    holding_strategy: str = Field(default="24h Fixed", max_length=50)

    position_size: float = Field(..., ge=0, le=100)
    leverage: int = Field(..., ge=1, le=100)
    max_drawdown_stop: float = Field(..., ge=-30, le=-5)

    funding_threshold: float = Field(default=0.0001)
    volatility_threshold: float = Field(default=0.015)


class StrategySettingResponse(BaseModel):
    id: int
    user_id: int

    exchange: str
    symbol: str

    confidence_threshold: float
    holding_strategy: str

    position_size: float
    leverage: int
    max_drawdown_stop: float

    funding_threshold: float
    volatility_threshold: float

    updated_at: datetime

    class Config:
        from_attributes = True