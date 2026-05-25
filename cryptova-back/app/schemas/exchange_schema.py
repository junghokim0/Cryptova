from pydantic import BaseModel, Field
from pydantic import BaseModel


class ExchangePositionResponse(BaseModel):
    exchange: str
    is_testnet: bool
    symbol: str
    side: str
    size: float
    entry_price: float
    leverage: float
    unrealised_pnl: float

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

class OrderQuantityPreviewResponse(BaseModel):
    symbol: str
    balance: float
    position_size: float
    leverage: float
    current_price: float
    order_value: float
    qty: float