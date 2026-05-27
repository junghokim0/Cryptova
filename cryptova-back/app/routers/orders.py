import json
from datetime import datetime, timedelta

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.api_key import ApiKey
from app.models.ai_signal import AISignal
from app.models.order import Order
from app.models.strategy_setting import StrategySetting
from app.models.trading_position import TradingPosition
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.order_schema import OrderExecuteRequest, OrderExecuteResponse
from app.services.bybit_service import BybitService
from app.services.encryption_service import EncryptionService


router = APIRouter(prefix="/orders", tags=["Orders"])

encryption_service = EncryptionService()


# =========================
# Bybit / Public Price Utils
# =========================
def get_user_bybit_service(db: Session, user_id: int) -> tuple[BybitService, ApiKey]:
    api_key_record = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == user_id)
        .filter(ApiKey.exchange == "bybit")
        .first()
    )

    if not api_key_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bybit API key is not registered.",
        )

    api_key = encryption_service.decrypt(api_key_record.api_key_encrypted)
    api_secret = encryption_service.decrypt(api_key_record.api_secret_encrypted)

    bybit_service = BybitService(
        api_key=api_key,
        api_secret=api_secret,
        is_testnet=api_key_record.is_testnet,
    )

    return bybit_service, api_key_record


def try_get_user_bybit_service(
    db: Session,
    user_id: int,
) -> tuple[BybitService | None, ApiKey | None]:
    """
    새 계정처럼 Bybit API key가 없어도 Paper/Dry-run 흐름은 가능해야 하므로,
    여기서는 예외를 던지지 않고 None을 반환한다.
    """

    api_key_record = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == user_id)
        .filter(ApiKey.exchange == "bybit")
        .first()
    )

    if not api_key_record:
        return None, None

    api_key = encryption_service.decrypt(api_key_record.api_key_encrypted)
    api_secret = encryption_service.decrypt(api_key_record.api_secret_encrypted)

    bybit_service = BybitService(
        api_key=api_key,
        api_secret=api_secret,
        is_testnet=api_key_record.is_testnet,
    )

    return bybit_service, api_key_record


def fetch_current_price_from_bybit(symbol: str = "BTCUSDT") -> float:
    """
    Public ticker 조회.
    API key 없이도 사용할 수 있다.
    Paper / Dry-run 주문, Paper PnL, Paper 청산에 사용한다.
    """

    url = "https://api.bybit.com/v5/market/tickers"

    params = {
        "category": "linear",
        "symbol": symbol,
    }

    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()

    data = response.json()
    result_list = data.get("result", {}).get("list", [])

    if not result_list:
        raise ValueError("Failed to fetch current price from Bybit public ticker.")

    return float(result_list[0]["lastPrice"])


# =========================
# DB Utils
# =========================
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


def get_target_signal(
    db: Session,
    user_id: int,
    signal_id: int | None,
) -> AISignal:
    if signal_id is not None:
        signal = (
            db.query(AISignal)
            .filter(AISignal.id == signal_id)
            .filter(AISignal.user_id == user_id)
            .first()
        )
    else:
        signal = (
            db.query(AISignal)
            .filter(AISignal.user_id == user_id)
            .order_by(AISignal.created_at.desc())
            .first()
        )

    if signal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI signal not found.",
        )

    return signal


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


def get_entry_order(
    db: Session,
    user_id: int,
    position: TradingPosition,
) -> Order | None:
    if not position.entry_order_id:
        return None

    return (
        db.query(Order)
        .filter(Order.id == position.entry_order_id)
        .filter(Order.user_id == user_id)
        .first()
    )


def is_paper_or_dry_position(
    position: TradingPosition,
    entry_order: Order | None,
) -> bool:
    if bool(position.is_dry_run):
        return True

    if entry_order is None:
        return False

    return entry_order.status in ["PAPER_SUBMITTED", "DRY_RUN"]


def calculate_pnl(
    side: str,
    entry_price: float,
    exit_price: float,
    qty: float,
) -> tuple[float, float]:
    if entry_price <= 0 or exit_price <= 0 or qty <= 0:
        return 0.0, 0.0

    if side == "LONG":
        pnl = (exit_price - entry_price) * qty
        pnl_pct = ((exit_price - entry_price) / entry_price) * 100

    elif side == "SHORT":
        pnl = (entry_price - exit_price) * qty
        pnl_pct = ((entry_price - exit_price) / entry_price) * 100

    else:
        pnl = 0.0
        pnl_pct = 0.0

    return round(pnl, 4), round(pnl_pct, 4)


def create_skipped_order(
    db: Session,
    user_id: int,
    signal_id: int | None,
    exchange: str,
    symbol: str,
    signal: str,
    message: str,
    raw_response: dict | None = None,
) -> Order:
    order = Order(
        user_id=user_id,
        signal_id=signal_id,
        exchange=exchange,
        symbol=symbol,
        signal=signal,
        side=None,
        order_type="Market",
        qty=0.0,
        entry_price=0.0,
        status="SKIPPED",
        bybit_order_id=None,
        message=message,
        raw_response=(
            json.dumps(raw_response, ensure_ascii=False)
            if raw_response is not None
            else None
        ),
    )

    db.add(order)
    db.commit()
    db.refresh(order)

    return order


def calculate_paper_qty(
    setting: StrategySetting,
    current_price: float,
    initial_balance: float = 10_000.0,
) -> float:
    """
    API key 없는 계정에서도 Paper/Dry-run 주문 수량을 계산하기 위한 함수.

    예:
    initial_balance = 10,000 USDT
    position_size = 1%
    leverage = 1
    current_price = 100,000
    주문 금액 = 100 USDT
    qty = 100 / 100000 = 0.001 BTC
    """

    if current_price <= 0:
        return 0.0

    position_size = float(setting.position_size or 1.0)
    leverage = float(setting.leverage or 1.0)

    position_size_ratio = position_size / 100.0
    order_notional = initial_balance * position_size_ratio * leverage

    qty = order_notional / current_price

    # Bybit BTCUSDT 수량 자리수에 맞춰 대략 0.001 단위로 반올림
    qty = round(qty, 3)

    # 너무 작으면 최소 테스트 수량 보정
    if qty <= 0:
        qty = 0.001

    return qty


def close_open_position_as_order(
    db: Session,
    current_user: User,
    symbol: str,
    signal: AISignal,
    open_position: TradingPosition,
    dry_run: bool,
) -> Order:
    """
    /orders/execute에서 이미 열린 포지션의 24h 만료 청산을 처리한다.
    Paper/Dry-run이면 API key 없이 public ticker로 청산한다.
    실제 Bybit 포지션이면 API key를 사용한다.
    """

    now = datetime.utcnow()
    close_side = "Sell" if open_position.side == "LONG" else "Buy"

    entry_order = get_entry_order(
        db=db,
        user_id=current_user.id,
        position=open_position,
    )

    is_paper_position = is_paper_or_dry_position(
        position=open_position,
        entry_order=entry_order,
    )

    if dry_run or is_paper_position:
        current_price = fetch_current_price_from_bybit(symbol=symbol)

        pnl, pnl_pct = calculate_pnl(
            side=open_position.side,
            entry_price=float(open_position.entry_price or 0),
            exit_price=float(current_price or 0),
            qty=float(open_position.qty or 0),
        )

        if entry_order is not None and entry_order.status == "PAPER_SUBMITTED":
            close_status = "PAPER_CLOSED"
            execution_mode = "PAPER"
            close_message = (
                "24h holding period expired. "
                f"Paper position closed at simulated exit price {current_price}."
            )
        else:
            close_status = "DRY_RUN"
            execution_mode = "DRY_RUN"
            close_message = (
                "24h holding period expired. "
                f"Dry-run position closed at simulated exit price {current_price}."
            )

        close_order = Order(
            user_id=current_user.id,
            signal_id=signal.id,
            exchange=open_position.exchange or "paper",
            symbol=symbol,
            signal="CLOSE",
            side=close_side,
            order_type="Market",
            qty=open_position.qty,
            entry_price=current_price,
            status=close_status,
            bybit_order_id=None,
            message=close_message,
            raw_response=json.dumps(
                {
                    "position_id": open_position.id,
                    "execution_mode": execution_mode,
                    "close_side": close_side,
                    "qty": float(open_position.qty or 0),
                    "entry_price": float(open_position.entry_price or 0),
                    "exit_price": current_price,
                    "pnl": pnl,
                    "pnl_pct": pnl_pct,
                },
                ensure_ascii=False,
            ),
        )

    else:
        bybit_service, api_key_record = get_user_bybit_service(
            db=db,
            user_id=current_user.id,
        )

        current_price = bybit_service.get_ticker_price(symbol=symbol)

        pnl, pnl_pct = calculate_pnl(
            side=open_position.side,
            entry_price=float(open_position.entry_price or 0),
            exit_price=float(current_price or 0),
            qty=float(open_position.qty or 0),
        )

        close_result = bybit_service.place_market_order(
            symbol=symbol,
            side=close_side,
            qty=open_position.qty,
            reduce_only=True,
        )

        close_order = Order(
            user_id=current_user.id,
            signal_id=signal.id,
            exchange=api_key_record.exchange,
            symbol=symbol,
            signal="CLOSE",
            side=close_side,
            order_type="Market",
            qty=open_position.qty,
            entry_price=current_price,
            status="SUBMITTED",
            bybit_order_id=close_result.get("order_id"),
            message="24h holding period expired. Close order submitted.",
            raw_response=json.dumps(close_result, ensure_ascii=False),
        )

    db.add(close_order)

    open_position.status = "CLOSED"
    open_position.exit_price = close_order.entry_price
    open_position.closed_at = now
    open_position.pnl = pnl
    open_position.pnl_pct = pnl_pct

    if pnl > 0:
        open_position.result = "WIN"
    elif pnl < 0:
        open_position.result = "LOSS"
    else:
        open_position.result = "EVEN"

    db.commit()
    db.refresh(close_order)

    return close_order


# =========================
# Main Endpoint
# =========================
@router.post("/execute", response_model=OrderExecuteResponse)
def execute_order(
    request: OrderExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    signal = get_target_signal(
        db=db,
        user_id=current_user.id,
        signal_id=request.signal_id,
    )

    symbol = request.symbol or signal.symbol
    now = datetime.utcnow()

    # =========================
    # 1. 이미 열린 포지션이 있으면 24h Fixed Holding Logic 적용
    # =========================
    open_position = get_open_position(
        db=db,
        user_id=current_user.id,
        symbol=symbol,
    )

    if open_position is not None:
        # 1-1. 아직 24시간이 안 지났으면 신규 신호 무시
        if now < open_position.hold_until:
            remaining = open_position.hold_until - now

            return create_skipped_order(
                db=db,
                user_id=current_user.id,
                signal_id=signal.id,
                exchange=open_position.exchange or "paper",
                symbol=symbol,
                signal=signal.signal,
                message=(
                    "Open position exists. "
                    "24h fixed holding period is still active. "
                    f"Remaining seconds: {int(remaining.total_seconds())}."
                ),
                raw_response={
                    "open_position_id": open_position.id,
                    "opened_at": open_position.opened_at.isoformat(),
                    "hold_until": open_position.hold_until.isoformat(),
                    "current_signal": signal.signal,
                },
            )

        # 1-2. 24시간이 지났으면 청산 처리
        try:
            return close_open_position_as_order(
                db=db,
                current_user=current_user,
                symbol=symbol,
                signal=signal,
                open_position=open_position,
                dry_run=request.dry_run,
            )

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to close expired position: {str(e)}",
            )

    # =========================
    # 2. 열린 포지션이 없는데 신호가 HOLD면 주문 안 함
    # =========================
    if signal.signal == "HOLD":
        return create_skipped_order(
            db=db,
            user_id=current_user.id,
            signal_id=signal.id,
            exchange="paper",
            symbol=symbol,
            signal=signal.signal,
            message="Signal is HOLD. No order executed.",
        )

    if signal.signal not in ["LONG", "SHORT"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported signal: {signal.signal}",
        )

    # =========================
    # 3. 기본 설정 / 방향 / 현재가 준비
    # =========================
    setting = get_or_create_strategy_setting(
        db=db,
        user_id=current_user.id,
    )

    side = "Buy" if signal.signal == "LONG" else "Sell"

    bybit_service, api_key_record = try_get_user_bybit_service(
        db=db,
        user_id=current_user.id,
    )

    # API key가 있으면 Bybit service 현재가, 없으면 public ticker 현재가
    if bybit_service is not None:
        try:
            current_price = bybit_service.get_ticker_price(symbol=symbol)
        except Exception:
            current_price = fetch_current_price_from_bybit(symbol=symbol)
    else:
        current_price = fetch_current_price_from_bybit(symbol=symbol)

    # =========================
    # 4. 주문 수량 계산
    # =========================
    if bybit_service is not None:
        try:
            balance_data = bybit_service.get_usdt_balance()
            balance = float(balance_data.get("available_balance") or 0)
            leverage = float(setting.leverage or 1)
            position_size = float(setting.position_size or 1.0)
            position_size_ratio = position_size / 100.0

            qty_data = bybit_service.calculate_order_quantity(
                balance=balance,
                position_size=position_size_ratio,
                leverage=leverage,
                current_price=current_price,
            )

            qty = float(qty_data["qty"])

        except Exception:
            qty = calculate_paper_qty(
                setting=setting,
                current_price=current_price,
            )
            qty_data = {
                "mode": "paper_fallback_qty",
                "qty": qty,
                "reason": "Failed to calculate quantity from Bybit balance.",
            }
            balance_data = None

    else:
        qty = calculate_paper_qty(
            setting=setting,
            current_price=current_price,
        )
        qty_data = {
            "mode": "paper_qty_without_api_key",
            "qty": qty,
            "initial_balance": 10_000.0,
            "position_size": setting.position_size,
            "leverage": setting.leverage,
        }
        balance_data = None

    if qty <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Calculated order quantity is 0.",
        )

    # =========================
    # 5. dry_run=True
    # =========================
    # 실제 주문을 보내지 않고 DB에 DRY_RUN 주문/포지션만 생성한다.
    if request.dry_run:
        order = Order(
            user_id=current_user.id,
            signal_id=signal.id,
            exchange=api_key_record.exchange if api_key_record else "paper",
            symbol=symbol,
            signal=signal.signal,
            side=side,
            order_type="Market",
            qty=qty,
            entry_price=current_price,
            status="DRY_RUN",
            bybit_order_id=None,
            message=(
                f"Dry run only. Simulated {side} market order "
                f"for {qty} {symbol}."
            ),
            raw_response=json.dumps(
                {
                    "execution_mode": "DRY_RUN",
                    "signal": signal.signal,
                    "side": side,
                    "qty_data": qty_data,
                    "balance": balance_data,
                    "current_price": current_price,
                    "api_key_registered": api_key_record is not None,
                },
                ensure_ascii=False,
            ),
        )

        db.add(order)
        db.flush()

        position = TradingPosition(
            user_id=current_user.id,
            signal_id=signal.id,
            entry_order_id=order.id,
            exchange=order.exchange,
            symbol=symbol,
            side=signal.signal,
            qty=qty,
            entry_price=current_price,
            status="OPEN",
            holding_strategy="24h Fixed",
            opened_at=now,
            hold_until=now + timedelta(hours=24),
            is_dry_run=True,
        )

        db.add(position)
        db.commit()
        db.refresh(order)

        return order

    # =========================
    # 6. API key 없는 계정 + dry_run=False
    # =========================
    # 실제 주문은 불가능하므로 PAPER_SUBMITTED로 대체한다.
    if bybit_service is None:
        order_status = "PAPER_SUBMITTED"
        bybit_order_id = None
        order_message = (
            "Bybit API key is not registered. "
            "Paper execution recorded instead."
        )
        raw_response = {
            "execution_mode": "PAPER",
            "reason": "Bybit API key is not registered.",
            "symbol": symbol,
            "side": side,
            "qty": qty,
            "entry_price": current_price,
        }

    # =========================
    # 7. API key 있는 계정 + dry_run=False
    # =========================
    # 실제 Bybit 주문을 시도하고, 실패하면 PAPER_SUBMITTED로 대체한다.
    else:
        try:
            exchange_position = bybit_service.get_position(symbol=symbol)
            exchange_position_size = float(exchange_position.get("size") or 0)

            if exchange_position_size > 0:
                return create_skipped_order(
                    db=db,
                    user_id=current_user.id,
                    signal_id=signal.id,
                    exchange=api_key_record.exchange,
                    symbol=symbol,
                    signal=signal.signal,
                    message=(
                        "Open position already exists on Bybit. "
                        "Duplicate order prevented."
                    ),
                    raw_response=exchange_position,
                )

            order_result = bybit_service.place_market_order(
                symbol=symbol,
                side=side,
                qty=qty,
                reduce_only=False,
            )

            order_status = "SUBMITTED"
            bybit_order_id = order_result.get("order_id")
            order_message = "Market order submitted to Bybit."
            raw_response = order_result

        except Exception as e:
            order_status = "PAPER_SUBMITTED"
            bybit_order_id = None
            order_message = (
                "Bybit real order failed. "
                "Paper execution recorded instead. "
                f"Original error: {str(e)}"
            )
            raw_response = {
                "execution_mode": "PAPER",
                "original_error": str(e),
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "entry_price": current_price,
                "reason": (
                    "Exchange order failed, but paper position was recorded "
                    "for strategy testing."
                ),
            }

    # =========================
    # 8. PAPER_SUBMITTED / SUBMITTED 주문 및 포지션 생성
    # =========================
    order = Order(
        user_id=current_user.id,
        signal_id=signal.id,
        exchange=api_key_record.exchange if api_key_record else "paper",
        symbol=symbol,
        signal=signal.signal,
        side=side,
        order_type="Market",
        qty=qty,
        entry_price=current_price,
        status=order_status,
        bybit_order_id=bybit_order_id,
        message=order_message,
        raw_response=json.dumps(raw_response, ensure_ascii=False),
    )

    db.add(order)
    db.flush()

    position = TradingPosition(
        user_id=current_user.id,
        signal_id=signal.id,
        entry_order_id=order.id,
        exchange=order.exchange,
        symbol=symbol,
        side=signal.signal,
        qty=qty,
        entry_price=current_price,
        status="OPEN",
        holding_strategy="24h Fixed",
        opened_at=now,
        hold_until=now + timedelta(hours=24),
        is_dry_run=False,
    )

    db.add(position)
    db.commit()
    db.refresh(order)

    return order