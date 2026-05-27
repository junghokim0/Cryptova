import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.api_key import ApiKey
from app.models.order import Order
from app.models.trading_position import TradingPosition
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.position_schema import (
    OpenPositionResponse,
    ClosePositionRequest,
    ClosePositionResponse,
    OpenPositionPnlResponse,
)
from app.services.bybit_service import BybitService
from app.services.encryption_service import EncryptionService


router = APIRouter(prefix="/positions", tags=["Positions"])

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


def calculate_pnl(
    side: str,
    entry_price: float,
    exit_price: float,
    qty: float,
) -> tuple[float, float]:
    """
    LONG:
        수익 = (청산가 - 진입가) * 수량

    SHORT:
        수익 = (진입가 - 청산가) * 수량
    """

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


@router.get("/open", response_model=OpenPositionResponse | None)
def get_current_open_position(
    symbol: str = "BTCUSDT",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = get_open_position(
        db=db,
        user_id=current_user.id,
        symbol=symbol,
    )

    return position


@router.post("/close", response_model=ClosePositionResponse)
def close_position(
    request: ClosePositionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    symbol = request.symbol

    position = get_open_position(
        db=db,
        user_id=current_user.id,
        symbol=symbol,
    )

    if position is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Open position not found.",
        )

    try:
        bybit_service, api_key_record = get_user_bybit_service(
            db=db,
            user_id=current_user.id,
        )

        # 현재가를 청산가로 사용
        exit_price = bybit_service.get_ticker_price(symbol=symbol)

        # LONG 포지션 청산은 Sell
        # SHORT 포지션 청산은 Buy
        close_side = "Sell" if position.side == "LONG" else "Buy"

        pnl, pnl_pct = calculate_pnl(
            side=position.side,
            entry_price=float(position.entry_price or 0),
            exit_price=float(exit_price or 0),
            qty=float(position.qty or 0),
        )

        # 현재 포지션을 만든 진입 주문 조회
        entry_order = None

        if position.entry_order_id:
            entry_order = (
                db.query(Order)
                .filter(Order.id == position.entry_order_id)
                .filter(Order.user_id == current_user.id)
                .first()
            )

        # entry_order가 PAPER_SUBMITTED이면 실제 거래소 포지션이 아니라
        # 우리 DB에서만 관리하는 Paper 포지션임
        is_paper_position = (
            entry_order is not None
            and entry_order.status == "PAPER_SUBMITTED"
        )

        # =========================
        # 1. Paper / Dry-run 청산
        # =========================
        # - request.dry_run=True인 경우
        # - 기존 포지션이 dry_run으로 생성된 경우
        # - PAPER_SUBMITTED 주문으로 생성된 경우
        #
        # 위 경우에는 Bybit에 실제 청산 주문을 보내지 않고
        # DB에서만 CLOSED 처리한다.
        if request.dry_run or position.is_dry_run or is_paper_position:
            if is_paper_position:
                close_status = "PAPER_CLOSED"
                execution_mode = "PAPER"
                close_message = (
                    f"Paper position closed. {position.side} position was closed "
                    f"at simulated exit price {exit_price}."
                )
            else:
                close_status = "DRY_RUN"
                execution_mode = "DRY_RUN"
                close_message = (
                    f"Dry run only. Would close {position.side} position "
                    f"with {close_side} market order."
                )

            close_order = Order(
                user_id=current_user.id,
                signal_id=position.signal_id,
                exchange=api_key_record.exchange,
                symbol=symbol,
                signal="CLOSE",
                side=close_side,
                order_type="Market",
                qty=position.qty,
                entry_price=exit_price,
                status=close_status,
                bybit_order_id=None,
                message=close_message,
                raw_response=json.dumps(
                    {
                        "position_id": position.id,
                        "execution_mode": execution_mode,
                        "close_side": close_side,
                        "qty": position.qty,
                        "entry_price": position.entry_price,
                        "exit_price": exit_price,
                        "pnl": pnl,
                        "pnl_pct": pnl_pct,
                    },
                    ensure_ascii=False,
                ),
            )

        # =========================
        # 2. 실제 Bybit 청산
        # =========================
        # 실제 Bybit에 열린 포지션인 경우에만 reduceOnly=True로 청산 주문을 보낸다.
        else:
            close_result = bybit_service.place_market_order(
                symbol=symbol,
                side=close_side,
                qty=position.qty,
                reduce_only=True,
            )

            close_order = Order(
                user_id=current_user.id,
                signal_id=position.signal_id,
                exchange=api_key_record.exchange,
                symbol=symbol,
                signal="CLOSE",
                side=close_side,
                order_type="Market",
                qty=position.qty,
                entry_price=exit_price,
                status="SUBMITTED",
                bybit_order_id=close_result.get("order_id"),
                message=f"{position.side} position close order submitted.",
                raw_response=json.dumps(close_result, ensure_ascii=False),
            )

        db.add(close_order)
        db.flush()

        # =========================
        # 3. 포지션 CLOSED 처리
        # =========================
        position.status = "CLOSED"
        position.exit_price = exit_price
        position.closed_at = datetime.utcnow()
        position.pnl = pnl
        position.pnl_pct = pnl_pct

        if pnl > 0:
            position.result = "WIN"
        elif pnl < 0:
            position.result = "LOSS"
        else:
            position.result = "EVEN"

        db.commit()
        db.refresh(close_order)

        return {
            "position_id": position.id,
            "order_id": close_order.id,
            "symbol": symbol,
            "side": position.side,
            "qty": position.qty,
            "entry_price": position.entry_price,
            "exit_price": exit_price,
            "status": position.status,
            "message": close_order.message,
            "pnl": pnl,
            "pnl_pct": pnl_pct,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to close position: {str(e)}",
        )

@router.get("/open/pnl", response_model=OpenPositionPnlResponse | None)
def get_open_position_pnl(
    symbol: str = "BTCUSDT",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = get_open_position(
        db=db,
        user_id=current_user.id,
        symbol=symbol,
    )

    if position is None:
        return None

    try:
        bybit_service, api_key_record = get_user_bybit_service(
            db=db,
            user_id=current_user.id,
        )

        current_price = bybit_service.get_ticker_price(symbol=symbol)

        pnl, pnl_pct = calculate_pnl(
            side=position.side,
            entry_price=float(position.entry_price or 0),
            exit_price=float(current_price or 0),
            qty=float(position.qty or 0),
        )

        return {
            "symbol": symbol,
            "side": position.side,
            "qty": position.qty,
            "entry_price": position.entry_price,
            "current_price": current_price,
            "unrealized_pnl": pnl,
            "unrealized_pnl_pct": pnl_pct,
            "status": position.status,
            "opened_at": position.opened_at,
            "hold_until": position.hold_until,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to calculate open position PnL: {str(e)}",
        )
    
from datetime import datetime
from typing import Optional

import requests
from fastapi import Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.trading_position import TradingPosition
from app.models.user import User
from app.routers.auth import get_current_user


class PaperPortfolioSummaryResponse(BaseModel):
    user_id: int
    symbol: str

    initial_balance: float
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    total_pnl_pct: float

    paper_total_asset: float

    open_position_id: Optional[int] = None
    open_position_side: Optional[str] = None
    open_position_qty: Optional[float] = None
    open_position_entry_price: Optional[float] = None
    current_price: Optional[float] = None

    closed_trade_count: int
    open_trade_count: int

    updated_at: datetime


def fetch_current_price_from_bybit(symbol: str = "BTCUSDT") -> float:
    url = "https://api-testnet.bybit.com/v5/market/tickers"

    params = {
        "category": "linear",
        "symbol": symbol,
    }

    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()

    data = response.json()

    result_list = data.get("result", {}).get("list", [])

    if not result_list:
        raise ValueError("Failed to fetch current price from Bybit.")

    return float(result_list[0]["lastPrice"])


@router.get("/paper-portfolio", response_model=PaperPortfolioSummaryResponse)
def get_paper_portfolio_summary(
    symbol: str = "BTCUSDT",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    initial_balance = 10_000.0

    closed_positions = (
        db.query(TradingPosition)
        .filter(TradingPosition.user_id == current_user.id)
        .filter(TradingPosition.symbol == symbol)
        .filter(TradingPosition.status == "CLOSED")
        .all()
    )

    open_positions = (
        db.query(TradingPosition)
        .filter(TradingPosition.user_id == current_user.id)
        .filter(TradingPosition.symbol == symbol)
        .filter(TradingPosition.status == "OPEN")
        .order_by(TradingPosition.opened_at.desc())
        .all()
    )

    realized_pnl = 0.0

    for position in closed_positions:
        if position.pnl is not None:
            realized_pnl += float(position.pnl)

    current_price = None
    unrealized_pnl = 0.0

    open_position = open_positions[0] if open_positions else None

    if open_position is not None:
        current_price = fetch_current_price_from_bybit(symbol)

        qty = float(open_position.qty)
        entry_price = float(open_position.entry_price)

        if open_position.side == "LONG":
            unrealized_pnl = (current_price - entry_price) * qty
        elif open_position.side == "SHORT":
            unrealized_pnl = (entry_price - current_price) * qty

    total_pnl = realized_pnl + unrealized_pnl
    paper_total_asset = initial_balance + total_pnl

    total_pnl_pct = 0.0
    if initial_balance > 0:
        total_pnl_pct = (total_pnl / initial_balance) * 100

    return PaperPortfolioSummaryResponse(
        user_id=current_user.id,
        symbol=symbol,

        initial_balance=initial_balance,
        realized_pnl=round(realized_pnl, 4),
        unrealized_pnl=round(unrealized_pnl, 4),
        total_pnl=round(total_pnl, 4),
        total_pnl_pct=round(total_pnl_pct, 4),

        paper_total_asset=round(paper_total_asset, 4),

        open_position_id=open_position.id if open_position else None,
        open_position_side=open_position.side if open_position else None,
        open_position_qty=float(open_position.qty) if open_position else None,
        open_position_entry_price=float(open_position.entry_price)
        if open_position
        else None,
        current_price=current_price,

        closed_trade_count=len(closed_positions),
        open_trade_count=len(open_positions),

        updated_at=datetime.utcnow(),
    )