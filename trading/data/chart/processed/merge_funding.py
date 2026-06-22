#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
chart_hourly_features.csv
+
bybit_funding_rate_raw.csv

를 합쳐서 chart_hourly_features_funding13.csv 생성
"""

import os
import pandas as pd


CHART_PATH = "data/chart/processed/chart_hourly_features.csv"
FUNDING_PATH = "data/chart/raw/bybit_funding_rate_raw.csv"

OUT_PATH = "data/chart/processed/chart_hourly_features_funding13.csv"


def main():
    print("===== Load =====")

    chart = pd.read_csv(CHART_PATH)
    funding = pd.read_csv(FUNDING_PATH)

    print("chart rows  :", len(chart))
    print("funding rows:", len(funding))

    # =========================
    # 시간 변환
    # =========================
    chart["hour"] = pd.to_datetime(chart["hour"], utc=True, errors="coerce")
    funding["ts"] = pd.to_datetime(funding["ts"], utc=True, errors="coerce")

    if chart["hour"].isna().sum() > 0:
        raise ValueError("chart hour에 NaN이 있습니다.")

    if funding["ts"].isna().sum() > 0:
        raise ValueError("funding ts에 NaN이 있습니다.")

    chart = chart.sort_values("hour").reset_index(drop=True)
    funding = funding.sort_values("ts").drop_duplicates("ts").reset_index(drop=True)

    # =========================
    # funding: 8h → 1h resample + ffill
    # =========================
    funding = (
        funding
        .set_index("ts")[["funding_rate"]]
        .resample("1h")
        .ffill()
        .reset_index()
        .rename(columns={"ts": "hour"})
    )

    funding["funding_rate"] = pd.to_numeric(
        funding["funding_rate"],
        errors="coerce"
    )

    # =========================
    # merge
    # =========================
    merged = chart.merge(
        funding,
        on="hour",
        how="left",
        validate="one_to_one",
    )

    merged["funding_rate"] = merged["funding_rate"].ffill()

    # =========================
    # 검증
    # =========================
    print("\n===== NaN Check =====")
    print("funding_rate NaN:", int(merged["funding_rate"].isna().sum()))

    if merged["funding_rate"].isna().sum() > 0:
        raise ValueError("funding_rate에 NaN이 남아 있습니다.")

    diff = merged["hour"].diff().dropna()
    bad_diff = int((diff != pd.Timedelta(hours=1)).sum())

    print("\n===== Interval Check =====")
    print("bad 1h interval count:", bad_diff)

    if bad_diff > 0:
        raise ValueError("merged 데이터에 1시간 간격이 아닌 구간이 있습니다.")

    chart_feature_cols_funding13 = [
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
        "funding_rate",
    ]

    missing = set(chart_feature_cols_funding13) - set(merged.columns)
    if missing:
        raise ValueError(f"feature 컬럼 누락: {sorted(missing)}")

    print("\n===== Feature Check =====")
    print("chart feature count:", len(chart_feature_cols_funding13))
    print(chart_feature_cols_funding13)

    print("\n===== Range Check =====")
    print("chart hour range :", chart["hour"].min(), "~", chart["hour"].max())
    print("funding range    :", funding["hour"].min(), "~", funding["hour"].max())
    print("merged range     :", merged["hour"].min(), "~", merged["hour"].max())

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    merged.to_csv(OUT_PATH, index=False, encoding="utf-8-sig")

    print("\n✅ Chart + Funding merge 완료")
    print("saved:", OUT_PATH)
    print("rows :", len(merged))


if __name__ == "__main__":
    main()