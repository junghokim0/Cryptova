import numpy as np
import pandas as pd
from pathlib import Path

CHART_FEATURE_PATH = Path("data/chart/processed/chart_hourly_features_latest.csv")

CHART_FEATURE_COLS = [
    "log_return",
    "return_6h",
    "return_24h",
    "std_24h",
    "close_ma24_gap",
    "close_ma72_gap",
    "volume_ratio_24",
    "spread_ratio",
    "macd_hist",
    "hour_sin",
    "hour_cos",
    "is_missing_candle",
]


def load_latest_chart_window():
    df = pd.read_csv(CHART_FEATURE_PATH)

    if len(df) < 72:
        raise ValueError(f"chart feature row가 부족합니다: {len(df)}")

    latest = df.tail(72)

    x_chart = latest[CHART_FEATURE_COLS].to_numpy(dtype=np.float32)

    if x_chart.shape != (72, 12):
        raise ValueError(f"x_chart shape 오류: {x_chart.shape}")

    return x_chart