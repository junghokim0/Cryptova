from datetime import datetime
from typing import Optional
from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.trading_position import TradingPosition
from app.models.trading_run import TradingRun
from app.routers.auth import get_current_user
from app.routers.signals import generate_signal_from_ai_server
from app.routers.orders import execute_order
from app.routers.positions import close_position
from app.schemas.order_schema import OrderExecuteRequest
from app.schemas.position_schema import ClosePositionRequest
from app.models.strategy_setting import StrategySetting
from app.models.ai_signal import AISignal
from app.models.order import Order

router = APIRouter(prefix="/trading", tags=["Trading"])


class TradingRunOnceRequest(BaseModel):
    symbol: str = Field(default="BTCUSDT", max_length=50)

    # False면 실제 주문 시도 후 실패 시 PAPER_SUBMITTED로 대체
    # True면 주문을 실제로 보내지 않고 DRY_RUN으로만 기록
    dry_run: bool = False


class TradingRunOnceResponse(BaseModel):
    action: str
    message: str

    symbol: str

    signal_id: Optional[int] = None
    signal: Optional[str] = None

    order_id: Optional[int] = None
    order_status: Optional[str] = None

    position_id: Optional[int] = None
    position_status: Optional[str] = None

    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None

    executed_at: datetime


class TradingRunResponse(BaseModel):
    id: int
    user_id: int
    symbol: str

    action: str
    message: Optional[str]

    signal_id: Optional[int]
    signal: Optional[str]

    order_id: Optional[int]
    order_status: Optional[str]

    position_id: Optional[int]
    position_status: Optional[str]

    pnl: Optional[float]
    pnl_pct: Optional[float]

    executed_at: datetime

    class Config:
        from_attributes = True
class TradingMarkerResponse(BaseModel):
    time: int
    datetime: str

    price: float
    marker_type: str  # SIGNAL, ENTRY, EXIT

    signal: Optional[str] = None  # LONG, SHORT, HOLD
    side: Optional[str] = None    # Buy, Sell, CLOSE

    label: str
    color_hint: str

def get_open_position(
    db: Session,
    user_id: int,
    symbol: str,
) -> TradingPosition | None:
    return (
        db.query(TradingPosition)
        .filter(TradingPosition.user_id == user_id)
        .filter(TradingPosition.symbol == symbol)
        .filter(TradingPosition.status == "OPEN")
        .order_by(TradingPosition.opened_at.desc())
        .first()
    )


def save_trading_run(
    db: Session,
    user_id: int,
    symbol: str,
    action: str,
    message: str,
    signal_id: int | None = None,
    signal: str | None = None,
    order_id: int | None = None,
    order_status: str | None = None,
    position_id: int | None = None,
    position_status: str | None = None,
    pnl: float | None = None,
    pnl_pct: float | None = None,
) -> TradingRun:
    trading_run = TradingRun(
        user_id=user_id,
        symbol=symbol,
        action=action,
        message=message,
        signal_id=signal_id,
        signal=signal,
        order_id=order_id,
        order_status=order_status,
        position_id=position_id,
        position_status=position_status,
        pnl=pnl,
        pnl_pct=pnl_pct,
    )

    db.add(trading_run)
    db.commit()
    db.refresh(trading_run)

    return trading_run

def to_unix_seconds(dt: datetime | None) -> int | None:
    if dt is None:
        return None

    return int(dt.timestamp())

def get_or_create_strategy_setting(db: Session, user_id: int) -> StrategySetting:
    setting = (
        db.query(StrategySetting)
        .filter(StrategySetting.user_id == user_id)
        .first()
    )

    if setting:
        return setting

    setting = StrategySetting(
        user_id=user_id,
        exchange="Bybit",
        symbol="BTCUSDT",
        confidence_threshold=46.0,
        holding_strategy="24h Fixed",
        auto_trading_enabled=False,
        position_size=1.0,
        leverage=1,
        max_drawdown_stop=-10.0,
        funding_threshold=0.0001,
        volatility_threshold=0.015,
    )

    db.add(setting)

    try:
        db.commit()
        db.refresh(setting)
        return setting

    except IntegrityError:
        db.rollback()

        setting = (
            db.query(StrategySetting)
            .filter(StrategySetting.user_id == user_id)
            .first()
        )

        if setting:
            return setting

        raise

@router.post("/run-once", response_model=TradingRunOnceResponse)
def run_trading_once(
    request: TradingRunOnceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    symbol = request.symbol
    now = datetime.utcnow()

    # =========================
    # 1. 현재 OPEN 포지션 확인
    # =========================
    open_position = get_open_position(
        db=db,
        user_id=current_user.id,
        symbol=symbol,
    )

    # =========================
    # 2. OPEN 포지션이 있는 경우
    # =========================
    if open_position is not None:
        # 2-1. 아직 24시간 보유 시간이 안 지났으면 스킵
        if now < open_position.hold_until:
            remaining = open_position.hold_until - now

            action = "SKIPPED_HOLDING"
            message = (
                "Open position exists. "
                "24h fixed holding period is still active. "
                f"Remaining seconds: {int(remaining.total_seconds())}."
            )

            save_trading_run(
                db=db,
                user_id=current_user.id,
                symbol=symbol,
                action=action,
                message=message,
                signal_id=open_position.signal_id,
                signal=open_position.side,
                order_id=open_position.entry_order_id,
                order_status=None,
                position_id=open_position.id,
                position_status=open_position.status,
                pnl=None,
                pnl_pct=None,
            )

            return TradingRunOnceResponse(
                action=action,
                message=message,
                symbol=symbol,
                signal_id=open_position.signal_id,
                signal=open_position.side,
                order_id=open_position.entry_order_id,
                order_status=None,
                position_id=open_position.id,
                position_status=open_position.status,
                pnl=None,
                pnl_pct=None,
                executed_at=now,
            )

        # 2-2. 24시간이 지났으면 포지션 청산
        close_result = close_position(
            request=ClosePositionRequest(
                symbol=symbol,
                dry_run=request.dry_run,
            ),
            db=db,
            current_user=current_user,
        )

        action = "CLOSED_POSITION"
        message = close_result["message"]

        save_trading_run(
            db=db,
            user_id=current_user.id,
            symbol=symbol,
            action=action,
            message=message,
            signal_id=open_position.signal_id,
            signal=open_position.side,
            order_id=close_result.get("order_id"),
            order_status="CLOSED",
            position_id=close_result.get("position_id"),
            position_status=close_result.get("status"),
            pnl=close_result.get("pnl"),
            pnl_pct=close_result.get("pnl_pct"),
        )

        return TradingRunOnceResponse(
            action=action,
            message=message,
            symbol=symbol,
            signal_id=open_position.signal_id,
            signal=open_position.side,
            order_id=close_result.get("order_id"),
            order_status="CLOSED",
            position_id=close_result.get("position_id"),
            position_status=close_result.get("status"),
            pnl=close_result.get("pnl"),
            pnl_pct=close_result.get("pnl_pct"),
            executed_at=now,
        )

    # =========================
    # 3. OPEN 포지션이 없으면 새 AI Signal 생성
    # =========================
    signal = generate_signal_from_ai_server(
        db=db,
        current_user=current_user,
    )

    # =========================
    # 4. 생성된 Signal로 주문 실행
    # =========================
    order = execute_order(
        request=OrderExecuteRequest(
            signal_id=signal.id,
            symbol=symbol,
            dry_run=request.dry_run,
        ),
        db=db,
        current_user=current_user,
    )

    # 주문 후 새 OPEN 포지션 확인
    new_position = get_open_position(
        db=db,
        user_id=current_user.id,
        symbol=symbol,
    )

    if order.status == "SKIPPED":
        action = "SKIPPED_SIGNAL"
    elif order.status == "DRY_RUN":
        action = "DRY_RUN_ORDER"
    elif order.status == "PAPER_SUBMITTED":
        action = "PAPER_ORDER_OPENED"
    elif order.status == "SUBMITTED":
        action = "REAL_ORDER_SUBMITTED"
    elif order.status == "FAILED":
        action = "ORDER_FAILED"
    else:
        action = "ORDER_PROCESSED"

    message = order.message or "Trading run completed."

    save_trading_run(
        db=db,
        user_id=current_user.id,
        symbol=symbol,
        action=action,
        message=message,
        signal_id=signal.id,
        signal=signal.signal,
        order_id=order.id,
        order_status=order.status,
        position_id=new_position.id if new_position else None,
        position_status=new_position.status if new_position else None,
        pnl=None,
        pnl_pct=None,
    )

    return TradingRunOnceResponse(
        action=action,
        message=message,
        symbol=symbol,
        signal_id=signal.id,
        signal=signal.signal,
        order_id=order.id,
        order_status=order.status,
        position_id=new_position.id if new_position else None,
        position_status=new_position.status if new_position else None,
        pnl=None,
        pnl_pct=None,
        executed_at=now,
    )


@router.get("/runs", response_model=list[TradingRunResponse])
def get_trading_runs(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = (
        db.query(TradingRun)
        .filter(TradingRun.user_id == current_user.id)
        .order_by(TradingRun.executed_at.desc())
        .limit(limit)
        .all()
    )

    return runs

@router.post("/start")
def start_auto_trading(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setting = get_or_create_strategy_setting(
        db=db,
        user_id=current_user.id,
    )

    setting.auto_trading_enabled = True
    db.commit()
    db.refresh(setting)

    return {
        "auto_trading_enabled": setting.auto_trading_enabled,
        "symbol": setting.symbol,
        "message": "Auto trading started.",
    }


@router.post("/stop")
def stop_auto_trading(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setting = get_or_create_strategy_setting(
        db=db,
        user_id=current_user.id,
    )

    setting.auto_trading_enabled = False
    db.commit()
    db.refresh(setting)

    return {
        "auto_trading_enabled": setting.auto_trading_enabled,
        "symbol": setting.symbol,
        "message": "Auto trading stopped.",
    }


@router.get("/status")
def get_auto_trading_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setting = get_or_create_strategy_setting(
        db=db,
        user_id=current_user.id,
    )

    return {
        "auto_trading_enabled": setting.auto_trading_enabled,
        "symbol": setting.symbol,
        "holding_strategy": setting.holding_strategy,
        "position_size": setting.position_size,
        "leverage": setting.leverage,
        "confidence_threshold": setting.confidence_threshold,
    }
@router.get("/markers", response_model=list[TradingMarkerResponse])
def get_trading_markers(
    symbol: str = "BTCUSDT",
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    markers: list[TradingMarkerResponse] = []

    # =========================
    # 1. AI Signal 마커
    # =========================
    signals = (
        db.query(AISignal)
        .filter(AISignal.user_id == current_user.id)
        .filter(AISignal.symbol == symbol)
        .order_by(AISignal.created_at.desc())
        .limit(limit)
        .all()
    )

    for signal in signals:
        marker_time = to_unix_seconds(signal.created_at)

        if marker_time is None:
            continue

        if signal.signal == "LONG":
            color_hint = "green"
            label = f"AI LONG {signal.confidence:.0f}%"
        elif signal.signal == "SHORT":
            color_hint = "red"
            label = f"AI SHORT {signal.confidence:.0f}%"
        else:
            color_hint = "gray"
            label = f"AI HOLD {signal.confidence:.0f}%"

        markers.append(
            TradingMarkerResponse(
                time=marker_time,
                datetime=signal.created_at.isoformat(),
                price=float(signal.entry_price or 0),
                marker_type="SIGNAL",
                signal=signal.signal,
                side=None,
                label=label,
                color_hint=color_hint,
            )
        )

    # =========================
    # 2. Entry 주문 마커
    # =========================
    entry_orders = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .filter(Order.symbol == symbol)
        .filter(Order.status.in_(["PAPER_SUBMITTED", "SUBMITTED", "DRY_RUN"]))
        .filter(Order.signal.in_(["LONG", "SHORT"]))
        .order_by(Order.created_at.desc())
        .limit(limit)
        .all()
    )

    for order in entry_orders:
        marker_time = to_unix_seconds(order.created_at)

        if marker_time is None:
            continue

        if order.signal == "LONG":
            color_hint = "green"
            label = f"LONG ENTRY {order.qty}"
        elif order.signal == "SHORT":
            color_hint = "red"
            label = f"SHORT ENTRY {order.qty}"
        else:
            color_hint = "gray"
            label = f"ENTRY {order.qty}"

        markers.append(
            TradingMarkerResponse(
                time=marker_time,
                datetime=order.created_at.isoformat(),
                price=float(order.entry_price or 0),
                marker_type="ENTRY",
                signal=order.signal,
                side=order.side,
                label=label,
                color_hint=color_hint,
            )
        )

    # =========================
    # 3. Exit / Close 마커
    # =========================
    closed_positions = (
        db.query(TradingPosition)
        .filter(TradingPosition.user_id == current_user.id)
        .filter(TradingPosition.symbol == symbol)
        .filter(TradingPosition.status == "CLOSED")
        .filter(TradingPosition.closed_at.isnot(None))
        .order_by(TradingPosition.closed_at.desc())
        .limit(limit)
        .all()
    )

    for position in closed_positions:
        marker_time = to_unix_seconds(position.closed_at)

        if marker_time is None:
            continue

        pnl_pct = position.pnl_pct if position.pnl_pct is not None else 0.0

        if pnl_pct > 0:
            color_hint = "green"
            result_text = f"+{pnl_pct:.2f}%"
        elif pnl_pct < 0:
            color_hint = "red"
            result_text = f"{pnl_pct:.2f}%"
        else:
            color_hint = "gray"
            result_text = "0.00%"

        label = f"CLOSE {position.side} {result_text}"

        markers.append(
            TradingMarkerResponse(
                time=marker_time,
                datetime=position.closed_at.isoformat(),
                price=float(position.exit_price or position.entry_price or 0),
                marker_type="EXIT",
                signal=position.side,
                side="CLOSE",
                label=label,
                color_hint=color_hint,
            )
        )

    # 차트용으로 과거 → 최신 순 정렬
    markers.sort(key=lambda x: x.time)

    return markers