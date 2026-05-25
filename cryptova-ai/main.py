from fastapi import FastAPI
from pydantic import BaseModel
import random
import subprocess
import sys
from datetime import datetime
from pathlib import Path
import os
import numpy as np

from feature_loader import load_latest_chart_window
from inference import predict_signal, predict_latest_signal


app = FastAPI(title="Cryptova AI Server")

PROJECT_ROOT = Path(__file__).resolve().parent
WORKSPACE_ROOT = PROJECT_ROOT.parent

class MockPredictRequest(BaseModel):
    symbol: str = "BTCUSDT"


class PredictRequest(BaseModel):
    symbol: str = "BTCUSDT"
    x_chart: list
    x_news: list


@app.get("/")
def root():
    return {"message": "Cryptova AI Server is running"}

def run_script(script_path: Path):
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=WORKSPACE_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Script failed: {script_path}\n"
            f"STDOUT:\n{result.stdout}\n"
            f"STDERR:\n{result.stderr}"
        )

    return result.stdout


@app.post("/predict/mock")
def predict_mock(request: MockPredictRequest):
    signal = random.choice(["BUY", "SELL", "HOLD"])
    confidence = round(random.uniform(0.55, 0.90), 4)

    return {
        "symbol": request.symbol,
        "signal": signal,
        "confidence": confidence,
        "price": 0,
        "reason": "Mock AI signal generated",
        "created_at": datetime.utcnow().isoformat(),
    }


@app.post("/predict")
def predict(request: PredictRequest):
    result = predict_signal(
        request.x_chart,
        request.x_news,
    )

    return {
        "symbol": request.symbol,
        "signal": result["signal"],
        "confidence": result["confidence"],
        "price": 0,
        "reason": "Fusion model inference result",
        "prob_short": result["prob_short"],
        "prob_hold": result["prob_hold"],
        "prob_long": result["prob_long"],
        "created_at": datetime.utcnow().isoformat(),
    }


@app.post("/predict/test-dummy")
def predict_test_dummy():
    x_chart = [[0.0] * 12 for _ in range(72)]
    x_news = [[0.0] * 9 for _ in range(72)]

    result = predict_signal(x_chart, x_news)

    return {
        "symbol": "BTCUSDT",
        "signal": result["signal"],
        "confidence": result["confidence"],
        "price": 0,
        "reason": "Dummy 72-window inference test",
        "prob_short": result["prob_short"],
        "prob_hold": result["prob_hold"],
        "prob_long": result["prob_long"],
        "created_at": datetime.utcnow().isoformat(),
    }


@app.post("/predict/chart-latest")
def predict_chart_latest():
    x_chart = load_latest_chart_window()
    x_news = np.zeros((72, 9), dtype=np.float32)

    result = predict_signal(x_chart, x_news)

    return {
        "symbol": "BTCUSDT",
        "signal": result["signal"],
        "confidence": result["confidence"],
        "price": 0,
        "reason": "Latest chart feature + zero news inference",
        "prob_short": result["prob_short"],
        "prob_hold": result["prob_hold"],
        "prob_long": result["prob_long"],
        "created_at": datetime.utcnow().isoformat(),
    }


"""@app.post("/predict/latest")
def predict_latest():
    run_script(PROJECT_ROOT / "data/chart/raw/fetch_latest_chart.py")
    run_script(PROJECT_ROOT / "data/chart/processed/preprocess_latest_chart.py")

    run_script(PROJECT_ROOT / "data/news/raw/fetch_latest_news.py")
    run_script(PROJECT_ROOT / "data/news/processed/preprocess_latest_news.py")

    run_script(PROJECT_ROOT / "data/merged/merge_latest_chart_news.py")

    result = predict_latest_signal()

    return {
        "symbol": "BTCUSDT",
        "signal": result["signal"],
        "confidence": result["confidence"],
        "price": 0,
        "reason": "Latest chart + news merged inference result",
        "prob_short": result["prob_short"],
        "prob_hold": result["prob_hold"],
        "prob_long": result["prob_long"],
        "created_at": datetime.utcnow().isoformat(),
    }
    """
from fastapi import HTTPException

@app.post("/predict/latest")
def predict_latest():
    try:
        run_script(PROJECT_ROOT / "data/chart/raw/fetch_latest_chart.py")
        run_script(PROJECT_ROOT / "data/chart/processed/preprocess_latest_chart.py")
        run_script(PROJECT_ROOT / "data/news/raw/fetch_latest_news.py")
        run_script(PROJECT_ROOT / "data/news/processed/preprocess_latest_news.py")
        run_script(PROJECT_ROOT / "data/merged/merge_latest_chart_news.py")

        result = predict_latest_signal()

        return {
            "symbol": "BTCUSDT",
            "signal": result["signal"],
            "confidence": result["confidence"],
            "price": 0,
            "reason": "Latest chart + news merged inference result",
            "prob_short": result["prob_short"],
            "prob_hold": result["prob_hold"],
            "prob_long": result["prob_long"],
            "created_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))