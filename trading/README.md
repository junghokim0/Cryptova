# Cryptova Trading Model

This directory contains Cryptova's chart-and-news fusion research workflow. The runtime application is described in the repository-level [`README.md`](../README.md); this document focuses on the model, training, signal rules, and evaluation.

## Task definition

Cryptova is a direct three-class classifier. At each prediction timestamp it uses the preceding 72 hourly observations to estimate the direction of the following 24-hour return.

| Label ID | Signal | Target rule |
|---:|---|---|
| 0 | `SHORT` | future return `<= -1.2%` |
| 1 | `HOLD` | future return between `-1.2%` and `+1.2%` |
| 2 | `LONG` | future return `>= +1.2%` |

Unlike a return-forecasting model, Cryptova produces class logits and probabilities directly. It does not output a continuous predicted return.

## Inputs

Each sample contains aligned chart and news tensors covering the same 72 hourly timestamps.

| Modality | Shape | Description |
|---|---|---|
| Chart | `(72, 12)` | returns, volatility, trend, volume, spread, momentum, time, and missingness |
| News | `(72, 9)` | news availability, article volume, and FinBERT-derived sentiment aggregates |

### Chart features

| Feature | Interpretation |
|---|---|
| `log_return` | one-period log return |
| `return_6h` | six-hour return |
| `return_24h` | 24-hour return |
| `std_24h` | rolling 24-hour volatility |
| `close_ma24_gap` | close-price gap from the 24-hour moving average |
| `close_ma72_gap` | close-price gap from the 72-hour moving average |
| `volume_ratio_24` | volume relative to its 24-hour reference |
| `spread_ratio` | normalized market spread |
| `macd_hist` | MACD histogram |
| `hour_sin` | cyclical hour encoding, sine component |
| `hour_cos` | cyclical hour encoding, cosine component |
| `is_missing_candle` | missing-candle indicator |

### News features

| Feature | Interpretation |
|---|---|
| `news_presence` | whether news was observed for the hour |
| `news_count_log1p` | log-transformed article count |
| `finbert_mean` | mean FinBERT sentiment |
| `finbert_sq_mean` | mean squared sentiment value |
| `finbert_pos_sum` | aggregated positive sentiment |
| `finbert_neg_sum` | aggregated negative sentiment |
| `pos_neg_count_imbalance` | positive-versus-negative article imbalance |
| `finbert_mean_ma_24h` | 24-hour moving average of sentiment |
| `news_count_sum_24h` | rolling 24-hour article count |

## Architecture

```text
Chart (72 x 12)
  → TimesNet sequence encoder
  → chart projection (72 x 64) ──────────────┐
                                              ├─ per-time-step concat
News (72 x 9)                                 │  + nonlinear mixing
  → linear projection + positional embedding │  + learned modality gate
  → Transformer sequence encoder             │
  → news projection (72 x 64) ───────────────┘
                         ↓
                72 fusion tokens + CLS
                         ↓
                 Fusion Transformer
                         ↓
              CLS + mean + last pooling
                         ↓
                3-class signal logits
```

The model projects the encoded chart and news sequences into a shared hidden space. At every timestamp it combines nonlinear concatenation with a learned modality gate. A Fusion Transformer then processes the 72 fused tokens plus a learned CLS token. The classifier concatenates CLS, mean-pooled, and last-step representations.

The implementation is in [`main_fusion/fusion_model.py`](main_fusion/fusion_model.py) and its runtime copy is in [`../cryptova-ai/fusion_model.py`](../cryptova-ai/fusion_model.py).

### Default configuration

| Item | Value |
|---|---:|
| Input length | 72 hours |
| Prediction horizon | 24 hours |
| Chart hidden size | 32 |
| News hidden size | 32 |
| Fusion hidden size | 64 |
| News attention heads/layers | 4 / 1 |
| Fusion attention heads/layers | 4 / 1 |
| Dropout | 0.30 |
| Output classes | 3 |

Auxiliary chart-only and news-only classifier heads support multi-head training loss alongside the main fusion head.

## Training and selection

[`main_fusion/train_fusion_model.py`](main_fusion/train_fusion_model.py) trains the classifier on three chronological rolling Train/Validation/Test splits. Its research configuration uses a maximum of 50 epochs, early-stopping patience of 8, batch size 64, gradient clipping at 1.0, and seed 42.

Model and confidence-threshold selection use Validation data only. Test data is reserved for the final report. The training script expects prebuilt rolling tensors and metadata; its data paths must be configured for the local or Colab environment before execution.

## Signal variants

| Variant | Decision rule | Purpose |
|---|---|---|
| Cryptova-Raw | probability argmax | isolates the direct classifier output |
| Cryptova-Base | confidence below the validation-selected threshold becomes `HOLD` | measures confidence filtering |
| Cryptova-Full | Base plus validation-selected funding-rate and volatility filters | evaluates the complete research signal path |

Funding rate and volatility are external risk filters, not extra fusion-model inputs. The runtime inference copy currently uses a confidence threshold of `0.46`; the research evaluation selects a separate threshold within each rolling Validation period and freezes it for Test.

## Common benchmark protocol

The separate [Financial Forecasting Benchmark](https://github.com/junghokim0/financial-forecasting-benchmark) compares Cryptova with traditional, specialized, and pretrained time-series models.

| Item | Setting |
|---|---|
| Market frequency | hourly Bitcoin observations |
| Canonical input | previous 72 hours |
| Target | future 24-hour return or its three-class label |
| Splits | three chronological rolling Train/Validation/Test windows |
| Model selection | Validation only |
| Final evaluation | 6,291 connected out-of-sample Test timestamps |
| Trading rule | non-overlapping 24-hour positions |
| Cost | 0.1% fee + 0.1% slippage per selected trade |

## Connected out-of-sample results

| Model | Signal path | Macro F1 | Balanced accuracy | Cost-adjusted return |
|---|---|---:|---:|---:|
| Ridge-Flat | return → fixed threshold | 0.284691 | 0.343804 | -0.005% |
| LSTM Classifier | direct class | 0.318197 | 0.356864 | -39.67% |
| TimesNet Classifier | direct class | 0.364654 | 0.366543 | -16.21% |
| Chronos-2 LoRA | forecast → return → fixed threshold | 0.252000 | 0.338928 | -24.64% |
| TimesFM 2.5 LoRA | forecast → return → fixed threshold | 0.287013 | 0.345735 | -30.96% |
| **Cryptova-Raw** | direct class, argmax | **0.381875** | **0.393802** | -18.11% |
| Cryptova-Base | confidence filter | 0.376506 | 0.389647 | +7.42% |
| **Cryptova-Full** | confidence + funding/volatility filters | 0.350898 | 0.368649 | **+27.46%** |

Raw produced the strongest classification metrics, while Full produced the strongest cost-adjusted trading result. Risk filters can reject predictions that help class-level scores while improving the selected trade path.

## Reproduction files

```text
main_fusion/fusion_model.py
main_fusion/train_fusion_model.py
main_fusion/export_original12_predictions.py
main_fusion/backtest_original12_funding_vol_filter.py
```

Large datasets, fitted checkpoints, the local `chart_only/` encoder dependency, and provider-licensed news content are not committed. The public benchmark contains evaluation-ready prediction artifacts and common evaluator code, but it does not supply the omitted training data or weights required to retrain or run this repository from a fresh clone.

## Interpretation limits

The results show performance under the stated periods, target, evaluator, and cost assumptions. They do not prove future profitability, isolate the effect of news or architecture, establish superiority for other assets or horizons, or quantify repeated-seed uncertainty. Neural-model results were primarily produced with seed 42; repeated-seed analysis and a newly untouched holdout remain future work.
