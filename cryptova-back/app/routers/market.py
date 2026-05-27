import os
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel


router = APIRouter(prefix="/market", tags=["Market"])


class CandleResponse(BaseModel):
    time: int
    datetime: str

    open: float
    high: float
    low: float
    close: float
    volume: float


@router.get("/candles", response_model=list[CandleResponse])
def get_market_candles(
    symbol: str = Query(default="BTCUSDT", max_length=50),
    interval: str = Query(default="60"),
    limit: int = Query(default=200, ge=1, le=1000),
    category: Literal["linear", "spot"] = "linear",
):
    """
    실제 BTCUSDT 캔들 데이터를 가져오는 API.

    기본값:
    - symbol=BTCUSDT
    - interval=60분봉
    - limit=200개
    - category=linear, 즉 USDT perpetual 기준

    프론트 차트에서는 time, open, high, low, close를 사용하면 됨.
    """

    base_url = os.getenv("BYBIT_PUBLIC_BASE", "https://api.bybit.com")

    url = f"{base_url}/v5/market/kline"

    params = {
        "category": category,
        "symbol": symbol,
        "interval": interval,
        "limit": limit,
    }

    try:
        response = httpx.get(
            url,
            params=params,
            timeout=20.0,
        )
        response.raise_for_status()

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch market candles: {str(e)}",
        )

    data = response.json()

    if data.get("retCode") != 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=data.get("retMsg", "Bybit market kline request failed."),
        )

    raw_list = data.get("result", {}).get("list", [])

    candles: list[CandleResponse] = []

    for item in raw_list:
        # Bybit kline item 구조:
        # [
        #   startTime,
        #   openPrice,
        #   highPrice,
        #   lowPrice,
        #   closePrice,
        #   volume,
        #   turnover
        # ]
        start_ms = int(item[0])
        open_price = float(item[1])
        high_price = float(item[2])
        low_price = float(item[3])
        close_price = float(item[4])
        volume = float(item[5])

        dt = datetime.fromtimestamp(
            start_ms / 1000,
            tz=timezone.utc,
        )

        candles.append(
            CandleResponse(
                # lightweight-charts는 초 단위 timestamp를 쓰는 경우가 많음
                time=start_ms // 1000,
                datetime=dt.isoformat(),
                open=open_price,
                high=high_price,
                low=low_price,
                close=close_price,
                volume=volume,
            )
        )

    # Bybit 응답은 최신순으로 올 수 있어서 차트용으로 과거 → 최신순 정렬
    candles.sort(key=lambda x: x.time)

    return candles