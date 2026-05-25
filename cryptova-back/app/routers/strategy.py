from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.strategy_setting import StrategySetting
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.strategy_schema import (
    StrategySettingRequest,
    StrategySettingResponse,
)


router = APIRouter(prefix="/strategy", tags=["Strategy"])


def create_default_strategy_setting(db: Session, user_id: int) -> StrategySetting:
    setting = StrategySetting(
        user_id=user_id,
        exchange="Bybit",
        symbol="BTCUSDT",
        confidence_threshold=46.0,
        holding_strategy="24h Fixed",
        position_size=5.0,
        leverage=10,
        max_drawdown_stop=-10.0,
        funding_threshold=0.0001,
        volatility_threshold=0.015,
    )

    db.add(setting)
    db.commit()
    db.refresh(setting)

    return setting


@router.get("/settings", response_model=StrategySettingResponse)
def get_strategy_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setting = (
        db.query(StrategySetting)
        .filter(StrategySetting.user_id == current_user.id)
        .first()
    )

    if setting is None:
        setting = create_default_strategy_setting(db, current_user.id)

    return setting


@router.post("/settings", response_model=StrategySettingResponse)
def save_strategy_settings(
    request: StrategySettingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setting = (
        db.query(StrategySetting)
        .filter(StrategySetting.user_id == current_user.id)
        .first()
    )

    if setting is None:
        setting = StrategySetting(user_id=current_user.id)
        db.add(setting)

    setting.exchange = request.exchange
    setting.symbol = request.symbol

    setting.confidence_threshold = request.confidence_threshold
    setting.holding_strategy = request.holding_strategy

    setting.position_size = request.position_size
    setting.leverage = request.leverage
    setting.max_drawdown_stop = request.max_drawdown_stop

    setting.funding_threshold = request.funding_threshold
    setting.volatility_threshold = request.volatility_threshold

    db.commit()
    db.refresh(setting)

    return setting