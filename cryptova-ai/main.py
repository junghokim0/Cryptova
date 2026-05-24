from fastapi import FastAPI
from pydantic import BaseModel
import random
from datetime import datetime

app = FastAPI(title="Cryptova AI Server")


class PredictRequest(BaseModel):
    symbol: str = "BTCUSDT"


@app.get("/")
def root():
    return {"message": "Cryptova AI Server is running"}


@app.post("/predict/mock")
def predict_mock(request: PredictRequest):
    signal = random.choice(["BUY", "SELL", "HOLD"])
    confidence = round(random.uniform(0.55, 0.90), 4)

    return {
        "symbol": request.symbol,
        "signal": signal,
        "confidence": confidence,
        "price": 0,
        "reason": "Mock AI signal generated",
        "created_at": datetime.utcnow().isoformat()
    }