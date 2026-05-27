import json
from datetime import datetime
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
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


def fetch_current_price_from_bybit(symbol: str = "BTCUSDT") -> float:
    """
    Public ticker 조회.
    API key 없이도 사용 가능하다.
    Paper Portfolio / Paper PnL / Paper Close에서 사용한다.
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
        now = datetime.utcnow()

        close_side = "Sell" if position.side == "LONG" else "Buy"

        entry_order = get_entry_order(
            db=db,
            user_id=current_user.id,
            position=position,
        )

        is_paper_position = is_paper_or_dry_position(
            position=position,
            entry_order=entry_order,
        )

        # =========================
        # 1. Paper / Dry-run 청산
        # =========================
        # Paper/Dry-run은 Bybit API key 없이 public ticker로 청산가를 가져온다.
        if request.dry_run or is_paper_position:
            exit_price = fetch_current_price_from_bybit(symbol=symbol)

            pnl, pnl_pct = calculate_pnl(
                side=position.side,
                entry_price=float(position.entry_price or 0),
                exit_price=float(exit_price or 0),
                qty=float(position.qty or 0),
            )

            if entry_order is not None and entry_order.status == "PAPER_SUBMITTED":
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
                    f"Dry run only. {position.side} position was closed "
                    f"at simulated exit price {exit_price}."
                )

            close_order = Order(
                user_id=current_user.id,
                signal_id=position.signal_id,
                exchange=position.exchange or "paper",
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
                        "qty": float(position.qty or 0),
                        "entry_price": float(position.entry_price or 0),
                        "exit_price": exit_price,
                        "pnl": pnl,
                        "pnl_pct": pnl_pct,
                    },
                    ensure_ascii=False,
                ),
            )

        # =========================
        # 2. 실제 Bybit 포지션 청산
        # =========================
        # 실제 Bybit 포지션은 API key가 필요하다.
        else:
            bybit_service, api_key_record = get_user_bybit_service(
                db=db,
                user_id=current_user.id,
            )

            exit_price = bybit_service.get_ticker_price(symbol=symbol)

            pnl, pnl_pct = calculate_pnl(
                side=position.side,
                entry_price=float(position.entry_price or 0),
                exit_price=float(exit_price or 0),
                qty=float(position.qty or 0),
            )

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
        position.closed_at = now
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
        db.rollback()

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
        # Paper/Dry-run/실제 포지션 모두 public ticker로 현재가를 조회한다.
        # 이렇게 하면 새 계정에 Bybit API key가 없어도 Paper PnL 확인이 가능하다.
        current_price = fetch_current_price_from_bybit(symbol=symbol)

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
        try:
            current_price = fetch_current_price_from_bybit(symbol=symbol)
        except Exception:
            # public ticker 실패 시에도 Paper Portfolio 전체가 죽지 않도록 한다.
            current_price = float(open_position.entry_price or 0)

        qty = float(open_position.qty or 0)
        entry_price = float(open_position.entry_price or 0)

        if current_price and entry_price and qty:
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
        open_position_entry_price=(
            float(open_position.entry_price)
            if open_position and open_position.entry_price is not None
            else None
        ),
        current_price=current_price,

        closed_trade_count=len(closed_positions),
        open_trade_count=len(open_positions),

        updated_at=datetime.utcnow(),
    )