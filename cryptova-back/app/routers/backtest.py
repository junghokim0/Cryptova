import os
import math
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.backtest_result import BacktestResult
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.backtest_schema import BacktestResultResponse, BacktestRunRequest


router = APIRouter(prefix="/backtest", tags=["Backtest"])


# 현재 파일 위치:
# cryptova-back/app/routers/backtest.py
# parents[3] = Cryptova 루트 폴더
PROJECT_ROOT = Path(__file__).resolve().parents[3]


# 필요하면 .env에서 직접 경로 지정 가능
# BACKTEST_PREDICTION_PATH=C:\Users\User\Desktop\Cryptova\cryptova-ai\data\predictions\test_predictions.csv
# BACKTEST_FEATURE_PATH=C:\Users\User\Desktop\Cryptova\cryptova-ai\data\merged\merged_with_future_return_funding13.csv
PREDICTION_PATH_CANDIDATES = [
    os.getenv("BACKTEST_PREDICTION_PATH"),
    PROJECT_ROOT / "cryptova-ai" / "data" / "predictions" / "test_predictions.csv",
    PROJECT_ROOT / "cryptova-ai" / "data" / "predictions" / "val_predictions.csv",
    PROJECT_ROOT / "cryptova-ai" / "data" / "results" / "test_predictions.csv",
    PROJECT_ROOT / "cryptova-ai" / "outputs" / "test_predictions.csv",
    PROJECT_ROOT / "cryptova-ai" / "test_predictions.csv",
]

FEATURE_PATH_CANDIDATES = [
    os.getenv("BACKTEST_FEATURE_PATH"),
    PROJECT_ROOT / "cryptova-ai" / "data" / "merged" / "merged_with_future_return_funding13.csv",
    PROJECT_ROOT / "cryptova-ai" / "data" / "merged" / "merged_with_future_return_deriv14.csv",
    PROJECT_ROOT / "cryptova-ai" / "data" / "merged" / "merged_with_future_return.csv",
    PROJECT_ROOT / "cryptova-ai" / "data" / "merged" / "merged_hourly_features_funding13.csv",
    PROJECT_ROOT / "cryptova-ai" / "data" / "merged" / "merged_hourly_features.csv",
]


def resolve_existing_path(candidates: list) -> Optional[Path]:
    for candidate in candidates:
        if candidate is None:
            continue

        path = Path(candidate)

        if path.exists():
            return path

    return None


def find_time_column(df: pd.DataFrame) -> str:
    candidates = [
        "sample_time",
        "hour",
        "timestamp",
        "datetime",
        "time",
        "date",
        "created_at",
    ]

    for col in candidates:
        if col in df.columns:
            return col

    raise ValueError(
        f"Time column not found. Available columns: {list(df.columns)}"
    )


def normalize_time_column(df: pd.DataFrame, time_col: str) -> pd.DataFrame:
    result = df.copy()

    result[time_col] = pd.to_datetime(
        result[time_col],
        utc=True,
        errors="coerce",
    )

    result = result.dropna(subset=[time_col])
    result = result.sort_values(time_col)

    return result


def normalize_prediction_signal(value) -> str:
    """
    다양한 prediction 컬럼 형식을 LONG / HOLD / SHORT로 통일한다.

    지원 예:
    - "LONG", "HOLD", "SHORT"
    - "BUY", "SELL"
    - 0, 1, 2
      프로젝트 기본 가정: 0=LONG, 1=HOLD, 2=SHORT
    """

    if pd.isna(value):
        return "HOLD"

    if isinstance(value, str):
        text = value.strip().upper()

        if text in ["LONG", "BUY", "BULL", "UP"]:
            return "LONG"

        if text in ["SHORT", "SELL", "BEAR", "DOWN"]:
            return "SHORT"

        if text in ["HOLD", "NEUTRAL", "NONE"]:
            return "HOLD"

        if text in ["0", "0.0"]:
            return "LONG"

        if text in ["1", "1.0"]:
            return "HOLD"

        if text in ["2", "2.0"]:
            return "SHORT"

        return "HOLD"

    try:
        number = int(value)

        if number == 0:
            return "LONG"
        if number == 1:
            return "HOLD"
        if number == 2:
            return "SHORT"

    except Exception:
        pass

    return "HOLD"


def find_prediction_column(df: pd.DataFrame) -> str:
    candidates = [
        "y_pred_label",
        "y_pred_argmax_label",
        "y_pred_argmax",
        "pred_signal",
        "signal",
        "prediction",
        "pred",
        "y_pred",
        "pred_label",
        "predicted_label",
        "argmax",
    ]

    for col in candidates:
        if col in df.columns:
            return col

    raise ValueError(
        f"Prediction column not found. Available columns: {list(df.columns)}"
    )

def find_confidence_column(df: pd.DataFrame) -> Optional[str]:
    candidates = [
        "confidence",
        "conf",
        "max_prob",
        "prob",
        "pred_prob",
        "pred_confidence",
    ]

    for col in candidates:
        if col in df.columns:
            return col

    # 확률 컬럼이 있는 경우 자동 계산용
    prob_sets = [
        ["prob_long", "prob_hold", "prob_short"],
        ["p_long", "p_hold", "p_short"],
        ["long_prob", "hold_prob", "short_prob"],
        ["class_0_prob", "class_1_prob", "class_2_prob"],
    ]

    for prob_cols in prob_sets:
        if all(col in df.columns for col in prob_cols):
            return "__PROB_COLUMNS__"

    return None


def add_confidence(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()

    conf_col = find_confidence_column(result)

    if conf_col == "__PROB_COLUMNS__":
        prob_sets = [
            ["prob_long", "prob_hold", "prob_short"],
            ["p_long", "p_hold", "p_short"],
            ["long_prob", "hold_prob", "short_prob"],
            ["class_0_prob", "class_1_prob", "class_2_prob"],
        ]

        for prob_cols in prob_sets:
            if all(col in result.columns for col in prob_cols):
                result["confidence"] = result[prob_cols].max(axis=1)
                break

    elif conf_col is not None:
        result["confidence"] = pd.to_numeric(
            result[conf_col],
            errors="coerce",
        )

    else:
        # confidence가 없으면 일단 1.0으로 두어 threshold 필터를 통과시킨다.
        # 실제 실험 결과에서는 prediction CSV에 confidence를 넣는 것이 가장 좋다.
        result["confidence"] = 1.0

    result["confidence"] = result["confidence"].fillna(0.0)

    # 0~1이면 0~100으로 변환
    if result["confidence"].max() <= 1.0:
        result["confidence"] = result["confidence"] * 100

    return result


def load_prediction_data() -> pd.DataFrame:
    prediction_path = resolve_existing_path(PREDICTION_PATH_CANDIDATES)

    if prediction_path is None:
        searched = [str(p) for p in PREDICTION_PATH_CANDIDATES if p is not None]
        raise FileNotFoundError(
            "Prediction CSV file not found. "
            f"Searched paths: {searched}. "
            "Set BACKTEST_PREDICTION_PATH in .env if your file is elsewhere."
        )

    df = pd.read_csv(prediction_path)

    time_col = find_time_column(df)
    pred_col = find_prediction_column(df)

    df = normalize_time_column(df, time_col)
    df = add_confidence(df)

    df = df.rename(columns={time_col: "sample_time"})
    df["pred_signal"] = df[pred_col].apply(normalize_prediction_signal)

    return df[["sample_time", "pred_signal", "confidence"]].copy()


def load_feature_data() -> pd.DataFrame:
    feature_path = resolve_existing_path(FEATURE_PATH_CANDIDATES)

    if feature_path is None:
        searched = [str(p) for p in FEATURE_PATH_CANDIDATES if p is not None]
        raise FileNotFoundError(
            "Feature CSV file not found. "
            f"Searched paths: {searched}. "
            "Set BACKTEST_FEATURE_PATH in .env if your file is elsewhere."
        )

    df = pd.read_csv(feature_path)

    time_col = find_time_column(df)
    df = normalize_time_column(df, time_col)
    df = df.rename(columns={time_col: "sample_time"})

    if "close" not in df.columns:
        raise ValueError(
            f"'close' column not found in feature file. "
            f"Available columns: {list(df.columns)}"
        )

    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["close"])

    # future_return_24h 계열 컬럼이 있으면 사용, 없으면 close shift로 계산
    future_return_candidates = [
        "future_return_24h",
        "future_return",
        "target_return",
        "return_future_24h",
    ]

    future_col = None

    for col in future_return_candidates:
        if col in df.columns:
            future_col = col
            break

    if future_col is not None:
        df["future_return_24h"] = pd.to_numeric(
            df[future_col],
            errors="coerce",
        )
    else:
        # 1시간봉 기준 24시간 뒤 수익률
        df["future_close_24h"] = df["close"].shift(-24)
        df["future_return_24h"] = (
            df["future_close_24h"] / df["close"]
        ) - 1.0

    return df[["sample_time", "close", "future_return_24h"]].copy()


def merge_prediction_and_features(
    predictions: pd.DataFrame,
    features: pd.DataFrame,
) -> pd.DataFrame:
    predictions = predictions.sort_values("sample_time")
    features = features.sort_values("sample_time")

    merged = pd.merge_asof(
        predictions,
        features,
        on="sample_time",
        direction="nearest",
        tolerance=pd.Timedelta("30min"),
    )

    merged = merged.dropna(subset=["close", "future_return_24h"])
    merged = merged.sort_values("sample_time")

    return merged


def apply_backtest_rules(
    df: pd.DataFrame,
    request: BacktestRunRequest,
    initial_capital: float = 10_000.0,
) -> tuple[list[dict], list[dict], list[float]]:
    start_dt = pd.to_datetime(request.start_date, utc=True)
    end_dt = pd.to_datetime(request.end_date, utc=True)

    data = df[
        (df["sample_time"] >= start_dt)
        & (df["sample_time"] <= end_dt)
    ].copy()

    if data.empty:
        raise ValueError(
            "No rows available for the selected backtest period. "
            "Check start_date, end_date, and CSV time range."
        )

    equity = initial_capital
    peak_equity = initial_capital

    trades: list[dict] = []
    equity_curve: list[dict] = []

    last_entry_time: Optional[pd.Timestamp] = None

    for _, row in data.iterrows():
        sample_time = row["sample_time"]
        signal = row["pred_signal"]
        confidence = float(row["confidence"])
        future_return = float(row["future_return_24h"])
        close_price = float(row["close"])

        # 24h non-overlap: 마지막 진입 후 24시간 이내 신호는 무시
        if last_entry_time is not None:
            if sample_time < last_entry_time + pd.Timedelta(hours=24):
                continue

        if confidence < request.confidence_threshold:
            continue

        if signal not in ["LONG", "SHORT"]:
            continue

        if signal == "LONG":
            trade_return = future_return
        else:
            trade_return = -future_return

        # 포지션 사이즈 반영
        position_ratio = float(request.position_size) / 100.0
        equity_return = trade_return * position_ratio

        entry_equity = equity
        pnl = equity * equity_return
        equity = equity + pnl

        peak_equity = max(peak_equity, equity)
        drawdown_pct = ((equity / peak_equity) - 1.0) * 100.0

        trade = {
            "entry_time": sample_time,
            "exit_time": sample_time + pd.Timedelta(hours=24),
            "date": sample_time.strftime("%Y-%m-%d"),
            "side": signal,
            "entry_price": close_price,
            "return_pct": trade_return * 100.0,
            "equity_return_pct": equity_return * 100.0,
            "pnl": pnl,
            "equity_before": entry_equity,
            "equity_after": equity,
            "confidence": confidence,
            "drawdown_pct": drawdown_pct,
        }

        trades.append(trade)

        equity_curve.append(
            {
                "date": sample_time.strftime("%Y-%m-%d"),
                "value": round(float(equity), 2),
            }
        )

        last_entry_time = sample_time

        if drawdown_pct <= request.max_drawdown_stop:
            break

    if not equity_curve:
        equity_curve.append(
            {
                "date": start_dt.strftime("%Y-%m-%d"),
                "value": initial_capital,
            }
        )

    daily_equity = [initial_capital] + [item["value"] for item in equity_curve]

    return trades, equity_curve, daily_equity


def calculate_mdd(equity_values: list[float]) -> float:
    if not equity_values:
        return 0.0

    peak = equity_values[0]
    mdd = 0.0

    for value in equity_values:
        peak = max(peak, value)
        drawdown = (value / peak) - 1.0
        mdd = min(mdd, drawdown)

    return mdd * 100.0


def calculate_sharpe(trades: list[dict]) -> float:
    if len(trades) < 2:
        return 0.0

    returns = np.array([trade["equity_return_pct"] / 100.0 for trade in trades])

    mean_return = returns.mean()
    std_return = returns.std(ddof=1)

    if std_return == 0:
        return 0.0

    # trade 단위 샤프. 간단히 sqrt(N) 연율화 유사 처리
    return float((mean_return / std_return) * math.sqrt(len(returns)))


def build_monthly_returns(trades: list[dict]) -> list[str]:
    if not trades:
        return []

    df = pd.DataFrame(trades)
    df["month"] = pd.to_datetime(df["entry_time"]).dt.strftime("%Y-%m")
    monthly = df.groupby("month")["equity_return_pct"].sum().reset_index()

    result = []

    for value in monthly["equity_return_pct"].tolist():
        sign = "+" if value >= 0 else ""
        result.append(f"{sign}{value:.2f}")

    return result


def build_trade_stats(trades: list[dict]) -> dict:
    if not trades:
        return {
            "long_count": 0,
            "short_count": 0,
            "hold_count": 0,
            "long_win_rate": 0.0,
            "short_win_rate": 0.0,
            "avg_holding_time": "24.0h",
            "avg_win": "+0.00%",
            "avg_loss": "0.00%",
            "profit_factor": 0.0,
        }

    df = pd.DataFrame(trades)

    long_df = df[df["side"] == "LONG"]
    short_df = df[df["side"] == "SHORT"]

    winners = df[df["equity_return_pct"] > 0]
    losers = df[df["equity_return_pct"] < 0]

    gross_profit = winners["pnl"].sum() if len(winners) > 0 else 0.0
    gross_loss = abs(losers["pnl"].sum()) if len(losers) > 0 else 0.0

    if gross_loss == 0:
        profit_factor = float(gross_profit) if gross_profit > 0 else 0.0
    else:
        profit_factor = gross_profit / gross_loss

    def win_rate(sub_df: pd.DataFrame) -> float:
        if len(sub_df) == 0:
            return 0.0
        return (len(sub_df[sub_df["equity_return_pct"] > 0]) / len(sub_df)) * 100

    avg_win = winners["equity_return_pct"].mean() if len(winners) > 0 else 0.0
    avg_loss = losers["equity_return_pct"].mean() if len(losers) > 0 else 0.0

    return {
        "long_count": int(len(long_df)),
        "short_count": int(len(short_df)),
        "hold_count": 0,
        "long_win_rate": round(float(win_rate(long_df)), 2),
        "short_win_rate": round(float(win_rate(short_df)), 2),
        "avg_holding_time": "24.0h",
        "avg_win": f"+{avg_win:.2f}%" if avg_win >= 0 else f"{avg_win:.2f}%",
        "avg_loss": f"{avg_loss:.2f}%",
        "profit_factor": round(float(profit_factor), 2),
    }


def build_top_trades(trades: list[dict]) -> tuple[list[dict], list[dict]]:
    if not trades:
        return [], []

    sorted_trades = sorted(
        trades,
        key=lambda item: item["equity_return_pct"],
        reverse=True,
    )

    winners = sorted_trades[:5]
    losers = sorted_trades[-5:][::-1]

    def format_trade(trade: dict) -> dict:
        value = trade["equity_return_pct"]
        sign = "+" if value >= 0 else ""

        return {
            "date": trade["date"],
            "side": trade["side"],
            "return": f"{sign}{value:.2f}%",
        }

    return [format_trade(t) for t in winners], [format_trade(t) for t in losers]


def calculate_cagr(
    initial_capital: float,
    final_capital: float,
    start_date: str,
    end_date: str,
) -> float:
    start_dt = pd.to_datetime(start_date)
    end_dt = pd.to_datetime(end_date)

    days = max((end_dt - start_dt).days, 1)
    years = days / 365.0

    if initial_capital <= 0 or final_capital <= 0:
        return 0.0

    return ((final_capital / initial_capital) ** (1 / years) - 1) * 100.0


def run_real_backtest(request: BacktestRunRequest) -> dict:
    initial_capital = 10_000.0

    predictions = load_prediction_data()
    features = load_feature_data()
    merged = merge_prediction_and_features(predictions, features)

    trades, equity_curve, equity_values = apply_backtest_rules(
        merged,
        request,
        initial_capital=initial_capital,
    )

    final_capital = equity_values[-1] if equity_values else initial_capital

    total_return = ((final_capital / initial_capital) - 1.0) * 100.0
    cagr = calculate_cagr(
        initial_capital,
        final_capital,
        request.start_date,
        request.end_date,
    )
    sharpe = calculate_sharpe(trades)
    mdd = calculate_mdd(equity_values)

    trade_count = len(trades)
    win_count = len([trade for trade in trades if trade["equity_return_pct"] > 0])
    win_rate = (win_count / trade_count) * 100.0 if trade_count > 0 else 0.0

    monthly_returns = build_monthly_returns(trades)
    trade_stats = build_trade_stats(trades)
    top_winning_trades, top_losing_trades = build_top_trades(trades)

    result_json = {
        "equity_curve": equity_curve,
        "monthly_returns": monthly_returns,
        "trade_stats": trade_stats,
        "top_winning_trades": top_winning_trades,
        "top_losing_trades": top_losing_trades,
        "trade_samples": [
            {
                "date": trade["date"],
                "side": trade["side"],
                "entry_price": round(float(trade["entry_price"]), 2),
                "return_pct": round(float(trade["return_pct"]), 4),
                "equity_return_pct": round(float(trade["equity_return_pct"]), 4),
                "confidence": round(float(trade["confidence"]), 2),
            }
            for trade in trades[:50]
        ],
        "risk_filter": {
            "name": "Confidence + 24h Non-overlap + Max Drawdown",
            "enabled": True,
            "description": (
                "Trades are entered only when confidence is above threshold. "
                "Each position is held for 24 hours using non-overlap logic. "
                "Backtest stops when max drawdown threshold is breached."
            ),
        },
    }

    return {
        "total_return": round(float(total_return), 2),
        "cagr": round(float(cagr), 2),
        "sharpe": round(float(sharpe), 2),
        "mdd": round(float(mdd), 2),
        "win_rate": round(float(win_rate), 2),
        "trade_count": int(trade_count),
        "result_json": result_json,
    }


@router.post("/run", response_model=BacktestResultResponse)
def run_backtest(
    request: BacktestRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        backtest_result = run_real_backtest(request)

    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Backtest execution failed: {str(e)}",
        )

    result = BacktestResult(
        user_id=current_user.id,
        symbol=request.symbol,
        start_date=request.start_date,
        end_date=request.end_date,
        confidence_threshold=request.confidence_threshold,
        position_size=request.position_size,
        max_drawdown_stop=request.max_drawdown_stop,
        total_return=backtest_result["total_return"],
        cagr=backtest_result["cagr"],
        sharpe=backtest_result["sharpe"],
        mdd=backtest_result["mdd"],
        win_rate=backtest_result["win_rate"],
        trade_count=backtest_result["trade_count"],
        result_json=backtest_result["result_json"],
    )

    db.add(result)
    db.commit()
    db.refresh(result)

    return result


@router.get("/results", response_model=list[BacktestResultResponse])
def get_backtest_results(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = (
        db.query(BacktestResult)
        .filter(BacktestResult.user_id == current_user.id)
        .order_by(BacktestResult.created_at.desc())
        .all()
    )

    return results


@router.get("/results/{result_id}", response_model=BacktestResultResponse)
def get_backtest_result_detail(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = (
        db.query(BacktestResult)
        .filter(BacktestResult.id == result_id)
        .filter(BacktestResult.user_id == current_user.id)
        .first()
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backtest result not found",
        )

    return result