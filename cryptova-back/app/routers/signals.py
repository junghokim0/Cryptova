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


# 현재 파일 위치:
# cryptova-back/app/routers/signals.py
# parents[3] = Cryptova 루트 폴더
PROJECT_ROOT = Path(__file__).resolve().parents[3]

LATEST_MERGED_PATH = (
    PROJECT_ROOT
    / "cryptova-ai"
    / "data"
    / "merged"
    / "latest_merged_features.csv"
)

router = APIRouter(prefix="/signals", tags=["Signals"])


def safe_float(value, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


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


def load_latest_market_context() -> dict:
    """
    최신 merged feature 파일에서 설명 생성에 필요한 값을 가져온다.
    파일이 없거나 비어 있으면 기본값을 반환한다.
    """

    default_context = {
        "close": 0.0,
        "return_24h": 0.0,
        "std_24h": 0.0,
        "funding_rate": 0.0,
        "news_presence": 0.0,
        "news_count_log1p": 0.0,
        "news_count_sum_24h": 0.0,
        "news_count_sum_72h": 0.0,
        "finbert_mean": 0.0,
        "finbert_sq_mean": 0.0,
        "finbert_pos_sum": 0.0,
        "finbert_neg_sum": 0.0,
    }

    if not LATEST_MERGED_PATH.exists():
        return default_context

    try:
        df = pd.read_csv(LATEST_MERGED_PATH)

        if len(df) == 0:
            return default_context

        latest = df.iloc[-1]

        return {
            "close": safe_float(latest.get("close", 0.0)),
            "return_24h": safe_float(latest.get("return_24h", 0.0)),
            "std_24h": safe_float(latest.get("std_24h", 0.0)),
            "funding_rate": safe_float(latest.get("funding_rate", 0.0)),
            "news_presence": safe_float(latest.get("news_presence", 0.0)),
            "news_count_log1p": safe_float(latest.get("news_count_log1p", 0.0)),
            "news_count_sum_24h": safe_float(
                latest.get("news_count_sum_24h", 0.0)
            ),
            "news_count_sum_72h": safe_float(
                latest.get("news_count_sum_72h", 0.0)
            ),
            "finbert_mean": safe_float(latest.get("finbert_mean", 0.0)),
            "finbert_sq_mean": safe_float(latest.get("finbert_sq_mean", 0.0)),
            "finbert_pos_sum": safe_float(latest.get("finbert_pos_sum", 0.0)),
            "finbert_neg_sum": safe_float(latest.get("finbert_neg_sum", 0.0)),
        }

    except Exception:
        return default_context


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
            f"std_24h={std_24h:.6f}."
        )

    return {
        "raw_signal": raw_signal,
        "final_signal": final_signal,
        "confidence": int(confidence),
        "can_execute": can_execute,
        "filter_summary": filter_summary,
    }


def is_valid_summary_text(value: str | None) -> bool:
    """
    AI 서버가 placeholder 문구를 보내면 실제 설명으로 인정하지 않는다.
    """

    if value is None:
        return False

    text = str(value).strip()

    if not text:
        return False

    placeholder_keywords = [
        "not connected yet",
        "temporary",
        "placeholder",
        "total_time",
    ]

    lowered = text.lower()

    for keyword in placeholder_keywords:
        if keyword in lowered:
            return False

    return True


def build_news_summary(market_ctx: dict) -> str:
    news_presence = market_ctx["news_presence"]
    news_count_24h = market_ctx["news_count_sum_24h"]
    news_count_72h = market_ctx["news_count_sum_72h"]
    finbert_mean = market_ctx["finbert_mean"]
    finbert_pos_sum = market_ctx["finbert_pos_sum"]
    finbert_neg_sum = market_ctx["finbert_neg_sum"]

    if news_presence <= 0 and news_count_24h <= 0:
        return (
            "No meaningful recent news signal was detected in the latest "
            "feature window, so the model relied more heavily on chart-based "
            "features."
        )

    if finbert_mean > 0.05:
        sentiment_text = "positive"
    elif finbert_mean < -0.05:
        sentiment_text = "negative"
    else:
        sentiment_text = "mixed or neutral"

    return (
        f"Recent BTC-related news activity was detected. "
        f"The 24h news count feature is {news_count_24h:.2f}, "
        f"and the 72h news count feature is {news_count_72h:.2f}. "
        f"FinBERT sentiment appears {sentiment_text} "
        f"(mean={finbert_mean:.4f}, positive_sum={finbert_pos_sum:.4f}, "
        f"negative_sum={finbert_neg_sum:.4f})."
    )


def build_chart_summary(market_ctx: dict) -> str:
    close = market_ctx["close"]
    return_24h = market_ctx["return_24h"]
    std_24h = market_ctx["std_24h"]
    funding_rate = market_ctx["funding_rate"]

    if return_24h > 0.01:
        trend_text = "upward momentum"
    elif return_24h < -0.01:
        trend_text = "downward pressure"
    else:
        trend_text = "sideways movement"

    if std_24h > 0.03:
        volatility_text = "high volatility"
    elif std_24h > 0.015:
        volatility_text = "moderate volatility"
    else:
        volatility_text = "low volatility"

    return (
        f"The latest BTCUSDT close price is approximately {close:.2f}. "
        f"The 24h return feature indicates {trend_text} "
        f"(return_24h={return_24h:.4f}), while the 24h standard deviation "
        f"suggests {volatility_text} (std_24h={std_24h:.4f}). "
        f"The funding rate feature is {funding_rate:.6f}."
    )


def build_reason_summary(
    ai_result: dict,
    risk_result: dict,
    market_ctx: dict,
) -> str:
    final_signal = risk_result["final_signal"]
    raw_signal = risk_result["raw_signal"]
    confidence = risk_result["confidence"]
    price = ai_result.get("price") or market_ctx.get("close", 0.0)

    if final_signal == "LONG":
        direction_text = "a potential upward trading opportunity"
    elif final_signal == "SHORT":
        direction_text = "a potential downside trading opportunity"
    else:
        direction_text = (
            "an uncertain market condition where active entry is not preferred"
        )

    return (
        f"The AI model originally produced a {raw_signal} signal and the final "
        f"execution signal became {final_signal}. "
        f"The model confidence is {confidence}%, and the reference price is "
        f"approximately {float(price):.2f}. "
        f"Based on the latest chart and news features, the system interpreted "
        f"the market as {direction_text}."
    )


def build_signal_summaries(
    ai_result: dict,
    risk_result: dict,
) -> dict:
    """
    AI 서버가 실제 summary를 주면 그것을 사용하고,
    summary가 없거나 placeholder면 latest_merged_features.csv 기반 설명을 생성한다.
    """

    market_ctx = load_latest_market_context()

    ai_reason = ai_result.get("reason_summary") or ai_result.get("reason")
    ai_news_summary = ai_result.get("news_summary")
    ai_chart_summary = ai_result.get("chart_summary")

    if is_valid_summary_text(ai_reason):
        reason_summary = ai_reason
    else:
        reason_summary = build_reason_summary(
            ai_result=ai_result,
            risk_result=risk_result,
            market_ctx=market_ctx,
        )

    if is_valid_summary_text(ai_news_summary):
        news_summary = ai_news_summary
    else:
        news_summary = build_news_summary(market_ctx)

    if is_valid_summary_text(ai_chart_summary):
        chart_summary = ai_chart_summary
    else:
        chart_summary = build_chart_summary(market_ctx)

    filter_summary = risk_result["filter_summary"]

    return {
        "reason_summary": reason_summary,
        "news_summary": news_summary,
        "chart_summary": chart_summary,
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
        reason_summary = (
            "AI detected a potential upward market direction based on chart "
            "momentum and positive market context."
        )
        news_summary = "Recent market news shows relatively positive sentiment for BTC."
        chart_summary = (
            "Price action remains above key support zones with short-term "
            "bullish structure."
        )
        filter_summary = (
            "Confidence threshold passed. Default funding and volatility risk "
            "filter did not block this LONG signal."
        )

    elif signal_type == "SHORT":
        signal_status = random.choice(["CLOSED", "STOPPED"])
        result = random.choice(["+1.83%", "+2.31%", "-1.82%"])
        reason_summary = (
            "AI detected a potential downside move based on weak chart structure "
            "and risk-off market context."
        )
        news_summary = "Recent market news contains mixed or negative sentiment."
        chart_summary = (
            "Short-term price action shows weakness near resistance zones."
        )
        filter_summary = (
            "Confidence threshold passed. Signal was accepted after risk filter "
            "review."
        )

    else:
        signal_status = "CLOSED"
        result = None
        reason_summary = (
            "AI classified the current market condition as uncertain and avoided "
            "active entry."
        )
        news_summary = (
            "News sentiment is mixed and does not strongly support directional "
            "entry."
        )
        chart_summary = "Chart structure lacks clear trend continuation signal."
        filter_summary = (
            "Signal was converted to HOLD due to insufficient confidence or risk "
            "filter condition."
        )

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

    if signal_type in ["LONG", "SHORT"]:
        signal_status = "HOLDING"
    else:
        signal_status = "CLOSED"

    summaries = build_signal_summaries(
        ai_result=ai_result,
        risk_result=risk_result,
    )

    signal = AISignal(
        user_id=current_user.id,
        symbol=ai_result.get("symbol", "BTCUSDT"),
        signal=signal_type,
        confidence=confidence,
        entry_price=entry_price,
        status=signal_status,
        result=None,
        reason_summary=summaries["reason_summary"],
        news_summary=summaries["news_summary"],
        chart_summary=summaries["chart_summary"],
        filter_summary=summaries["filter_summary"],
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