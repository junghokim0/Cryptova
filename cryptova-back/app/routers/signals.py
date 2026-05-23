import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ai_signal import AISignal
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.signal_schema import AISignalCreateRequest, AISignalResponse


router = APIRouter(prefix="/signals", tags=["Signals"])


@router.post("/mock", response_model=AISignalResponse)
def create_mock_signal(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    signal_type = random.choice(["LONG", "SHORT", "HOLD"])
    confidence = random.choice([73, 78, 82, 87, 91])
    entry_price = round(random.uniform(62000, 69000), 2)

    if signal_type == "LONG":
        status = random.choice(["HOLDING", "CLOSED"])
        result = random.choice([None, "+2.15%", "+3.42%", "-1.20%"])
        reason_summary = "AI detected a potential upward market direction based on chart momentum and positive market context."
        news_summary = "Recent market news shows relatively positive sentiment for BTC."
        chart_summary = "Price action remains above key support zones with short-term bullish structure."
        filter_summary = "Confidence threshold passed. Default funding and volatility risk filter did not block this LONG signal."
    elif signal_type == "SHORT":
        status = random.choice(["CLOSED", "STOPPED"])
        result = random.choice(["+1.83%", "+2.31%", "-1.82%"])
        reason_summary = "AI detected a potential downside move based on weak chart structure and risk-off market context."
        news_summary = "Recent market news contains mixed or negative sentiment."
        chart_summary = "Short-term price action shows weakness near resistance zones."
        filter_summary = "Confidence threshold passed. Signal was accepted after risk filter review."
    else:
        status = "CLOSED"
        result = None
        reason_summary = "AI classified the current market condition as uncertain and avoided active entry."
        news_summary = "News sentiment is mixed and does not strongly support directional entry."
        chart_summary = "Chart structure lacks clear trend continuation signal."
        filter_summary = "Signal was converted to HOLD due to insufficient confidence or risk filter condition."

    signal = AISignal(
        user_id=current_user.id,
        symbol="BTCUSDT",
        signal=signal_type,
        confidence=confidence,
        entry_price=entry_price,
        status=status,
        result=result,
        reason_summary=reason_summary,
        news_summary=news_summary,
        chart_summary=chart_summary,
        filter_summary=filter_summary,
    )

    db.add(signal)
    db.commit()
    db.refresh(signal)

    return signal


@router.post("", response_model=AISignalResponse)
def create_signal(
    request: AISignalCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    signal = AISignal(
        user_id=current_user.id,
        symbol=request.symbol,
        signal=request.signal,
        confidence=request.confidence,
        entry_price=request.entry_price,
        status=request.status,
        result=request.result,
        reason_summary=request.reason_summary,
        news_summary=request.news_summary,
        chart_summary=request.chart_summary,
        filter_summary=request.filter_summary,
    )

    db.add(signal)
    db.commit()
    db.refresh(signal)

    return signal


@router.get("", response_model=list[AISignalResponse])
def get_signals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    signals = (
        db.query(AISignal)
        .filter(AISignal.user_id == current_user.id)
        .order_by(AISignal.created_at.desc())
        .all()
    )

    return signals


@router.get("/{signal_id}", response_model=AISignalResponse)
def get_signal_detail(
    signal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    signal = (
        db.query(AISignal)
        .filter(AISignal.id == signal_id)
        .filter(AISignal.user_id == current_user.id)
        .first()
    )

    if signal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal not found",
        )

    return signal