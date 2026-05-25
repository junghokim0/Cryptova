import random
import os
import httpx
import pandas as pd
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ai_signal import AISignal
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.signal_schema import AISignalCreateRequest, AISignalResponse
from app.models.strategy_setting import StrategySetting


LATEST_MERGED_PATH = Path(
    "cryptova-ai/data/merged/latest_merged_features.csv"
)

router = APIRouter(prefix="/signals", tags=["Signals"])


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

def load_latest_market_context():
    if not LATEST_MERGED_PATH.exists():
        return {
            "funding_rate": 0.0,
            "std_24h": 0.0,
        }

    df = pd.read_csv(LATEST_MERGED_PATH)

    if len(df) == 0:
        return {
            "funding_rate": 0.0,
            "std_24h": 0.0,
        }

    latest = df.iloc[-1]

    return {
        "funding_rate": float(latest.get("funding_rate", 0.0)),
        "std_24h": float(latest.get("std_24h", 0.0)),
    }

def apply_risk_execution_layer(ai_result: dict, setting: StrategySetting) -> dict:
    market_ctx = load_latest_market_context()

    funding_rate = market_ctx["funding_rate"]
    std_24h = market_ctx["std_24h"]

    raw_signal = ai_result.get("signal", "HOLD")

    if raw_signal == "BUY":
        raw_signal = "LONG"
    elif raw_signal == "SELL":
        raw_signal = "SHORT"

    raw_confidence = float(ai_result.get("confidence", 0))

    if raw_confidence <= 1:
        confidence = raw_confidence * 100
    else:
        confidence = raw_confidence

    final_signal = raw_signal
    can_execute = final_signal in ["LONG", "SHORT"]
    filter_summary = "Signal passed basic execution checks."

    if confidence < setting.confidence_threshold:
        final_signal = "HOLD"
        can_execute = False
        filter_summary = (
            f"Signal converted to HOLD because confidence "
            f"{confidence:.2f}% is below user threshold "
            f"{setting.confidence_threshold:.2f}%."
        )

    if (
        final_signal == "LONG"
        and funding_rate > setting.funding_threshold
        and std_24h < setting.volatility_threshold
    ):
        final_signal = "HOLD"
        can_execute = False

        filter_summary = (
            f"LONG blocked by funding/volatility gating. "
            f"funding_rate={funding_rate:.6f}, "
            f"std_24h={std_24h:.6f}"
        )

    return {
        "raw_signal": raw_signal,
        "final_signal": final_signal,
        "confidence": int(confidence),
        "can_execute": can_execute,
        "filter_summary": filter_summary,
    }


@router.post("/mock", response_model=AISignalResponse)
def create_mock_signal(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    signal_type = random.choice(["LONG", "SHORT", "HOLD"])
    confidence = random.choice([73, 78, 82, 87, 91])
    entry_price = round(random.uniform(62000, 69000), 2)

    if signal_type == "LONG":
        signal_status = random.choice(["HOLDING", "CLOSED"])
        result = random.choice([None, "+2.15%", "+3.42%", "-1.20%"])
        reason_summary = "AI detected a potential upward market direction based on chart momentum and positive market context."
        news_summary = "Recent market news shows relatively positive sentiment for BTC."
        chart_summary = "Price action remains above key support zones with short-term bullish structure."
        filter_summary = "Confidence threshold passed. Default funding and volatility risk filter did not block this LONG signal."

    elif signal_type == "SHORT":
        signal_status = random.choice(["CLOSED", "STOPPED"])
        result = random.choice(["+1.83%", "+2.31%", "-1.82%"])
        reason_summary = "AI detected a potential downside move based on weak chart structure and risk-off market context."
        news_summary = "Recent market news contains mixed or negative sentiment."
        chart_summary = "Short-term price action shows weakness near resistance zones."
        filter_summary = "Confidence threshold passed. Signal was accepted after risk filter review."

    else:
        signal_status = "CLOSED"
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
        status=signal_status,
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


@router.post("/generate", response_model=AISignalResponse)
def generate_signal_from_ai_server(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai_server_url = os.getenv("AI_SERVER_URL", "http://127.0.0.1:8001")

    try:
        response = httpx.post(
            f"{ai_server_url}/predict/latest",
            timeout=180.0,
        )
        response.raise_for_status()

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI Server request failed: {str(e)}",
        )

    ai_result = response.json()

    setting = get_or_create_strategy_setting(db, current_user.id)
    risk_result = apply_risk_execution_layer(ai_result, setting)

    signal_type = risk_result["final_signal"]
    confidence = risk_result["confidence"]
    entry_price = ai_result.get("price", 0)

    if signal_type == "LONG":
        signal_status = "HOLDING"
        reason_summary = ai_result.get(
            "reason",
            "AI Server generated a LONG signal.",
        )
        news_summary = "News summary is not connected yet."
        chart_summary = "Chart summary is not connected yet."
        filter_summary = risk_result["filter_summary"]

    elif signal_type == "SHORT":
        signal_status = "HOLDING"
        reason_summary = ai_result.get(
            "reason",
            "AI Server generated a SHORT signal.",
        )
        news_summary = "News summary is not connected yet."
        chart_summary = "Chart summary is not connected yet."
        filter_summary = risk_result["filter_summary"]

    else:
        signal_status = "CLOSED"
        reason_summary = ai_result.get(
            "reason",
            "AI Server generated a signal using latest chart and news data.",
        )
        news_summary = "News summary is not connected yet."
        chart_summary = "Chart summary is not connected yet."
        filter_summary = risk_result["filter_summary"]

    signal = AISignal(
        user_id=current_user.id,
        symbol=ai_result.get("symbol", "BTCUSDT"),
        signal=signal_type,
        confidence=confidence,
        entry_price=entry_price,
        status=signal_status,
        result=None,
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