import os
import time
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
# =========================
# Simple in-memory cache
# =========================
# 서버가 켜져 있는 동안만 유지되는 캐시
# 같은 차트 요청을 반복할 때 Bybit API를 다시 호출하지 않도록 함
MARKET_CANDLE_CACHE = {}

CACHE_TTL_SECONDS = 300  # 5분

router = APIRouter(prefix="/market", tags=["Market"])


class CandleResponse(BaseModel):
    time: int
    datetime: str

    open: float
    high: float
    low: float
    close: float
    volume: float


def parse_utc_datetime(value: str) -> datetime:
    """
    "2020-03-01" 또는 ISO datetime 문자열을 UTC datetime으로 변환.
    """

    try:
        if len(value) == 10:
            dt = datetime.strptime(value, "%Y-%m-%d")
            return dt.replace(tzinfo=timezone.utc)

        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        return dt.astimezone(timezone.utc)

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD or ISO datetime.",
        )


def interval_to_ms(interval: str) -> int:
    """
    Bybit interval 값을 대략적인 millisecond 단위로 변환.
    반복 조회에서 end 이동용으로 사용.
    """

    if interval.isdigit():
        minutes = int(interval)
        return minutes * 60 * 1000

    if interval == "D":
        return 24 * 60 * 60 * 1000

    if interval == "W":
        return 7 * 24 * 60 * 60 * 1000

    if interval == "M":
        # 월봉은 실제 월 길이가 다르지만, end 이동용으로만 쓰기 때문에 31일로 둔다.
        return 31 * 24 * 60 * 60 * 1000

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported interval: {interval}",
    )


def parse_bybit_candle(item) -> CandleResponse:
    """
    Bybit kline item 구조:
    [
      startTime,
      openPrice,
      highPrice,
      lowPrice,
      closePrice,
      volume,
      turnover
    ]
    """

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

    return CandleResponse(
        time=start_ms // 1000,
        datetime=dt.isoformat(),
        open=open_price,
        high=high_price,
        low=low_price,
        close=close_price,
        volume=volume,
    )


@router.get("/candles", response_model=list[CandleResponse])
def get_market_candles(
    symbol: str = Query(default="BTCUSDT", max_length=50),
    interval: str = Query(default="60"),
    category: Literal["linear", "spot"] = "linear",
    start_date: str = Query(default="2020-03-01"),
    end_date: str | None = Query(default=None),
    page_limit: int = Query(default=1000, ge=1, le=1000),
):
    """
    Bybit mainnet public kline API로 캔들 데이터를 가져온다.

    핵심:
    - 1H / 4H / 1D / 1W / 1M 모두 같은 start_date부터 현재까지 조회
    - interval만 다르게 적용
    - Bybit API는 한 번에 최대 1000개라서 end 기준으로 과거 방향 반복 조회
    - 프론트 차트용으로 과거 → 최신순 정렬해서 반환
    """

    base_url = os.getenv("BYBIT_PUBLIC_BASE", "https://api.bybit.com")
    url = f"{base_url}/v5/market/kline"

    cache_key = f"{symbol}:{interval}:{category}:{start_date}:{end_date}:{page_limit}"
    now_ts = time.time()

    cached = MARKET_CANDLE_CACHE.get(cache_key)

    if cached:
        cached_at = cached["cached_at"]
        cached_data = cached["data"]

        if now_ts - cached_at < CACHE_TTL_SECONDS:
            return cached_data

    start_dt = parse_utc_datetime(start_date)

    if end_date:
        end_dt = parse_utc_datetime(end_date)
    else:
        end_dt = datetime.now(timezone.utc)

    start_ms = int(start_dt.timestamp() * 1000)
    end_ms = int(end_dt.timestamp() * 1000)

    if start_ms >= end_ms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be earlier than end_date.",
        )

    step_ms = interval_to_ms(interval)

    all_candles_by_time: dict[int, CandleResponse] = {}

    current_end_ms = end_ms

    try:
        with httpx.Client(timeout=30.0) as client:
            while current_end_ms >= start_ms:
                params = {
                    "category": category,
                    "symbol": symbol,
                    "interval": interval,
                    "start": start_ms,
                    "end": current_end_ms,
                    "limit": page_limit,
                }

                response = client.get(
                    url,
                    params=params,
                )
                response.raise_for_status()

                data = response.json()

                if data.get("retCode") != 0:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=data.get(
                            "retMsg",
                            "Bybit market kline request failed.",
                        ),
                    )

                raw_list = data.get("result", {}).get("list", [])

                if not raw_list:
                    break

                parsed_batch: list[CandleResponse] = []

                for item in raw_list:
                    candle = parse_bybit_candle(item)

                    # start_date 이전 데이터가 섞여 들어오면 제외
                    if candle.time * 1000 < start_ms:
                        continue

                    # end_date 이후 데이터가 섞여 들어오면 제외
                    if candle.time * 1000 > end_ms:
                        continue

                    parsed_batch.append(candle)
                    all_candles_by_time[candle.time] = candle

                if not parsed_batch:
                    break

                oldest_time_sec = min(candle.time for candle in parsed_batch)
                oldest_time_ms = oldest_time_sec * 1000

                # 다음 요청은 이번에 받은 가장 오래된 캔들보다 더 과거로 이동
                next_end_ms = oldest_time_ms - step_ms

                if next_end_ms >= current_end_ms:
                    break

                current_end_ms = next_end_ms

                # API 과호출 방지용 짧은 대기
                time.sleep(0.03)

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch market candles: {str(e)}",
        )

    candles = list(all_candles_by_time.values())

    candles.sort(key=lambda x: x.time)

    MARKET_CANDLE_CACHE[cache_key] = {
        "cached_at": time.time(),
        "data": candles,
    }

    return candles