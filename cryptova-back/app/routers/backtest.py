import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.backtest_result import BacktestResult
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.backtest_schema import BacktestResultResponse, BacktestRunRequest


router = APIRouter(prefix="/backtest", tags=["Backtest"])


def make_mock_backtest_result(request: BacktestRunRequest) -> dict:
    total_return = round(random.uniform(18.0, 38.0), 2)
    cagr = round(total_return * random.uniform(0.72, 0.92), 2)
    sharpe = round(random.uniform(1.35, 2.45), 2)
    mdd = round(random.uniform(-12.0, -5.0), 2)
    win_rate = round(random.uniform(56.0, 68.0), 2)
    trade_count = random.randint(80, 150)

    equity_curve = [
        {"date": "2024-01", "value": 10000},
        {"date": "2024-02", "value": 10320},
        {"date": "2024-03", "value": 10180},
        {"date": "2024-04", "value": 10840},
        {"date": "2024-05", "value": 11290},
        {"date": "2024-06", "value": 11020},
        {"date": "2024-07", "value": 11680},
        {"date": "2024-08", "value": 12110},
        {"date": "2024-09", "value": 11840},
        {"date": "2024-10", "value": 12520},
        {"date": "2024-11", "value": 12960},
        {"date": "2024-12", "value": 13480},
        {"date": "2025-01", "value": 13240},
        {"date": "2025-02", "value": 13720},
        {"date": "2025-03", "value": 14150},
        {"date": "2025-04", "value": 13980},
        {"date": "2025-05", "value": round(10000 * (1 + total_return / 100), 2)},
    ]

    monthly_returns = [
        "+3.21",
        "-1.84",
        "+4.57",
        "+2.31",
        "+6.72",
        "-2.11",
        "+3.88",
        "+1.25",
        "-3.45",
        "+5.19",
        "+2.73",
        "+7.02",
        "+4.23",
        "-1.73",
        "+2.96",
        "+3.83",
        "+2.44",
    ]

    trade_stats = {
        "long_count": 78,
        "short_count": 28,
        "hold_count": 18,
        "long_win_rate": 67.95,
        "short_win_rate": 57.14,
        "avg_holding_time": "18.6h",
        "avg_win": "+2.31%",
        "avg_loss": "-1.78%",
        "profit_factor": 1.94,
    }

    top_winning_trades = [
        {"date": "2024-12-11", "side": "LONG", "return": "+4.86%"},
        {"date": "2024-10-28", "side": "LONG", "return": "+4.21%"},
        {"date": "2025-01-15", "side": "LONG", "return": "+3.96%"},
        {"date": "2024-03-05", "side": "LONG", "return": "+3.77%"},
        {"date": "2024-07-22", "side": "SHORT", "return": "+3.45%"},
    ]

    top_losing_trades = [
        {"date": "2024-08-07", "side": "LONG", "return": "-3.45%"},
        {"date": "2024-06-18", "side": "LONG", "return": "-3.21%"},
        {"date": "2024-09-03", "side": "SHORT", "return": "-2.98%"},
        {"date": "2025-02-12", "side": "LONG", "return": "-2.72%"},
        {"date": "2024-11-14", "side": "SHORT", "return": "-2.45%"},
    ]

    result_json = {
        "equity_curve": equity_curve,
        "monthly_returns": monthly_returns,
        "trade_stats": trade_stats,
        "top_winning_trades": top_winning_trades,
        "top_losing_trades": top_losing_trades,
        "risk_filter": {
            "name": "Funding + Volatility Joint Filter",
            "enabled": True,
            "description": "High funding and low volatility LONG signals are converted to HOLD.",
        },
    }

    return {
        "total_return": total_return,
        "cagr": cagr,
        "sharpe": sharpe,
        "mdd": mdd,
        "win_rate": win_rate,
        "trade_count": trade_count,
        "result_json": result_json,
    }


@router.post("/run", response_model=BacktestResultResponse)
def run_backtest(
    request: BacktestRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mock_result = make_mock_backtest_result(request)

    result = BacktestResult(
        user_id=current_user.id,
        symbol=request.symbol,
        start_date=request.start_date,
        end_date=request.end_date,
        confidence_threshold=request.confidence_threshold,
        position_size=request.position_size,
        max_drawdown_stop=request.max_drawdown_stop,
        total_return=mock_result["total_return"],
        cagr=mock_result["cagr"],
        sharpe=mock_result["sharpe"],
        mdd=mock_result["mdd"],
        win_rate=mock_result["win_rate"],
        trade_count=mock_result["trade_count"],
        result_json=mock_result["result_json"],
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