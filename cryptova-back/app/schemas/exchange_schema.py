from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    api_key: str = Field(..., min_length=1)
    api_secret: str = Field(..., min_length=1)
    exchange: str = "bybit"
    is_testnet: bool = True


class ApiKeyStatusResponse(BaseModel):
    registered: bool
    exchange: str | None = None
    is_testnet: bool | None = None


class ApiKeySaveResponse(BaseModel):
    message: str
    registered: bool
    exchange: str
    is_testnet: bool


class ApiKeyDeleteResponse(BaseModel):
    message: str
    registered: bool


class ExchangeBalanceResponse(BaseModel):
    exchange: str
    is_testnet: bool
    wallet_balance: float
    available_balance: float
    unrealized_pnl: float
    used_margin: float
    coin: str