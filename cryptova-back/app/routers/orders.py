import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
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


def get_or_create_strategy_setting(db: Session, user_id: int) -> StrategySetting:
    setting = (
        db.query(StrategySetting)
        .filter(StrategySetting.user_id == user_id)
        .first()
    )

    if setting is None:
        setting = StrategySetting(user_id=user_id)
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return setting


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

    # 1. 이미 열린 포지션이 있으면 24h Fixed Holding Logic 적용
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
                exchange=open_position.exchange,
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
            bybit_service, api_key_record = get_user_bybit_service(
                db=db,
                user_id=current_user.id,
            )

            close_side = "Sell" if open_position.side == "LONG" else "Buy"
            current_price = bybit_service.get_ticker_price(symbol=symbol)

            if request.dry_run or open_position.is_dry_run:
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
                    status="DRY_RUN",
                    bybit_order_id=None,
                    message=(
                        "Dry run only. 24h holding period expired. "
                        f"Would close {open_position.side} position."
                    ),
                    raw_response=json.dumps(
                        {
                            "position_id": open_position.id,
                            "close_side": close_side,
                            "qty": open_position.qty,
                            "entry_price": open_position.entry_price,
                            "exit_price": current_price,
                        },
                        ensure_ascii=False,
                    ),
                )
            else:
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
            open_position.exit_price = current_price
            open_position.closed_at = now

            db.commit()
            db.refresh(close_order)

            return close_order

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to close expired position: {str(e)}",
            )

    # 2. 열린 포지션이 없는데 신호가 HOLD면 주문 안 함
    if signal.signal == "HOLD":
        return create_skipped_order(
            db=db,
            user_id=current_user.id,
            signal_id=signal.id,
            exchange="bybit",
            symbol=symbol,
            signal=signal.signal,
            message="Signal is HOLD. No order executed.",
        )

    if signal.signal not in ["LONG", "SHORT"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported signal: {signal.signal}",
        )

    try:
        bybit_service, api_key_record = get_user_bybit_service(
            db=db,
            user_id=current_user.id,
        )

        setting = get_or_create_strategy_setting(
            db=db,
            user_id=current_user.id,
        )

        # 3. 실제 Bybit 포지션도 한 번 더 확인해서 중복 주문 방지
        exchange_position = bybit_service.get_position(symbol=symbol)
        exchange_position_size = float(exchange_position.get("size") or 0)

        if exchange_position_size > 0 and not request.dry_run:
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

        # 4. LONG/SHORT에 따라 주문 방향 결정
        if signal.signal == "LONG":
            side = "Buy"
        else:
            side = "Sell"

        # 5. 주문 수량 계산
        balance_data = bybit_service.get_usdt_balance()
        current_price = bybit_service.get_ticker_price(symbol=symbol)

        balance = float(balance_data.get("available_balance") or 0)
        leverage = float(setting.leverage or 1)

        # DB에는 5.0처럼 퍼센트로 저장되어 있으므로 0.05로 변환
        position_size = float(setting.position_size or 0)

        # strategy_settings.position_size는 항상 퍼센트 값으로 저장한다고 가정
        # 예: 1.0 = 1%, 5.0 = 5%, 0.1 = 0.1%
        position_size_ratio = position_size / 100

        qty_data = bybit_service.calculate_order_quantity(
            balance=balance,
            position_size=position_size_ratio,
            leverage=leverage,
            current_price=current_price,
        )

        qty = float(qty_data["qty"])

        if qty <= 0:
            raise Exception("Calculated order quantity is 0.")

        # 6. dry run이면 실제 주문 안 보내고 DB에만 기록
        if request.dry_run:
            order = Order(
                user_id=current_user.id,
                signal_id=signal.id,
                exchange=api_key_record.exchange,
                symbol=symbol,
                signal=signal.signal,
                side=side,
                order_type="Market",
                qty=qty,
                entry_price=current_price,
                status="DRY_RUN",
                bybit_order_id=None,
                message=(
                    f"Dry run only. Would place {side} market order "
                    f"for {qty} {symbol}."
                ),
                raw_response=json.dumps(
                    {
                        "signal": signal.signal,
                        "side": side,
                        "qty_data": qty_data,
                        "exchange_position": exchange_position,
                        "balance": balance_data,
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
                exchange=api_key_record.exchange,
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

        # 7. 실제 Bybit market order 실행
        # Bybit 주문이 성공하면 SUBMITTED,
        # Bybit 제한/에러로 실패하면 PAPER_SUBMITTED로 내부 모의 체결 처리
        try:
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
            # Bybit Testnet의 계정/지역/상품 제한 등으로 실주문이 막힐 수 있음.
            # 이 경우 자동매매 엔진 검증을 위해 Paper Execution으로 대체 저장.
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
                "reason": "Exchange order failed, but paper position was recorded for strategy testing.",
            }

        order = Order(
            user_id=current_user.id,
            signal_id=signal.id,
            exchange=api_key_record.exchange,
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
            exchange=api_key_record.exchange,
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

    except HTTPException:
        raise

    except Exception as e:
        order = Order(
            user_id=current_user.id,
            signal_id=signal.id,
            exchange="bybit",
            symbol=symbol,
            signal=signal.signal,
            side=None,
            order_type="Market",
            qty=0.0,
            entry_price=0.0,
            status="FAILED",
            bybit_order_id=None,
            message=f"Order execution failed: {str(e)}",
            raw_response=None,
        )

        db.add(order)
        db.commit()
        db.refresh(order)

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Order execution failed: {str(e)}",
        )