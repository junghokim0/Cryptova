import torch
import numpy as np
import pandas as pd
from pathlib import Path

from fusion_model import ChartNewsTimeFusionTransformerClassifier


LABEL_NAMES = ["SHORT", "HOLD", "LONG"]

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


PROJECT_ROOT = Path(__file__).resolve().parent

MODEL_PATH = PROJECT_ROOT / "models/best_model.pt"
MERGED_LATEST_PATH = PROJECT_ROOT / "data/merged/latest_merged_features.csv"


CONFIDENCE_THRESHOLD = 0.46

CHART_FEATURES = [
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

NEWS_FEATURES = [
    "news_presence",
    "news_count_log1p",
    "finbert_mean",
    "finbert_sq_mean",
    "finbert_pos_sum",
    "finbert_neg_sum",
    "pos_neg_count_imbalance",
    "finbert_mean_ma_24h",
    "news_count_sum_24h",
]

def build_model():
    model = ChartNewsTimeFusionTransformerClassifier(
        input_size=72,
        chart_input_dim=12,
        news_input_dim=9,
        num_classes=3,
        prediction_horizon=24,

        chart_hidden_size=32,
        chart_conv_hidden_size=64,
        chart_top_k=2,
        chart_num_kernels=4,
        chart_encoder_layers=1,

        news_hidden_size=32,
        news_num_heads=4,
        news_num_layers=1,

        fusion_hidden_size=64,
        fusion_num_heads=4,
        fusion_num_layers=1,

        classifier_hidden_size=64,
        dropout=0.30,
    ).to(DEVICE)

    state_dict = torch.load(MODEL_PATH, map_location=DEVICE)

    model.load_state_dict(state_dict)

    model.eval()

    return model


model = build_model()


def predict_signal(x_chart, x_news):

    x_chart = np.array(x_chart, dtype=np.float32)
    x_news = np.array(x_news, dtype=np.float32)

    chart_tensor = (
        torch.tensor(x_chart)
        .unsqueeze(0)
        .to(DEVICE)
    )

    news_tensor = (
        torch.tensor(x_news)
        .unsqueeze(0)
        .to(DEVICE)
    )

    with torch.no_grad():

        outputs = model(
            chart_tensor,
            news_tensor,
            return_aux=True,
        )

        logits = outputs["signal_logits"]

        probs = torch.softmax(
            logits,
            dim=1,
        ).cpu().numpy()[0]

    pred = int(np.argmax(probs))

    confidence = float(np.max(probs))

    if confidence < CONFIDENCE_THRESHOLD:
        pred = 1

    signal = LABEL_NAMES[pred]

    return {
        "signal": signal,
        "confidence": round(confidence * 100, 2),
        "prob_short": round(float(probs[0]), 4),
        "prob_hold": round(float(probs[1]), 4),
        "prob_long": round(float(probs[2]), 4),
    }


def load_latest_inputs():
    if not MERGED_LATEST_PATH.exists():
        raise FileNotFoundError(f"merged latest file not found: {MERGED_LATEST_PATH}")

    df = pd.read_csv(MERGED_LATEST_PATH)

    df["hour"] = pd.to_datetime(df["hour"], utc=True, errors="coerce")
    df = df.dropna(subset=["hour"])

    if len(df) < 72:
        raise ValueError(f"Not enough rows for inference: {len(df)} < 72")

    missing_chart = set(CHART_FEATURES) - set(df.columns)
    missing_news = set(NEWS_FEATURES) - set(df.columns)

    if missing_chart:
        raise ValueError(f"Missing chart features: {sorted(missing_chart)}")

    if missing_news:
        raise ValueError(f"Missing news features: {sorted(missing_news)}")

    df = df.sort_values("hour").tail(72).reset_index(drop=True)

    x_chart = df[CHART_FEATURES].astype(np.float32).values
    x_news = df[NEWS_FEATURES].astype(np.float32).values

    if x_chart.shape != (72, 12):
        raise ValueError(f"Invalid x_chart shape: {x_chart.shape}")

    if x_news.shape != (72, 9):
        raise ValueError(f"Invalid x_news shape: {x_news.shape}")

    return x_chart, x_news

def predict_latest_signal():
    x_chart, x_news = load_latest_inputs()
    return predict_signal(x_chart, x_news)


if __name__ == "__main__":
    result = predict_latest_signal()
    print(result)
