# Cryptova Trading Model

This directory documents the development of the Cryptova model. Cryptova was designed and trained before the later Financial Forecasting Benchmark was assembled. This document therefore focuses on Cryptova itself: the problem it was built to solve, how its chart-and-news architecture was constructed, how the raw classifier was extended into the final risk-filtered signal system, and what results the completed model produced.

The runtime web application is described in the repository-level [`README.md`](../README.md).

## Why Cryptova was built

Short-horizon cryptocurrency movement is influenced by both market structure and rapidly changing public information. A chart-only model can represent returns, trend, volatility, volume, spread, momentum, and periodic behavior, but it cannot directly represent the arrival or tone of financial news. A text-only model has the opposite limitation: it can summarize sentiment while lacking the market context in which that sentiment appears.

Cryptova was built around three design principles:

1. **Predict the decision class directly.** The model learns `SHORT/HOLD/LONG` instead of first forecasting an exact return and converting that value into a class.
2. **Process chart and news separately at first.** Each modality is handled by an encoder suited to its temporal features before both are projected into a shared representation space.
3. **Separate prediction from trade selection.** The neural network produces class probabilities; confidence and market-risk filters decide whether a directional prediction should remain an actionable signal.

This creates three observable stages of the same system:

```text
Chart + News neural classifier
  → Cryptova-Raw: probability argmax
  → Cryptova-Base: low-confidence predictions become HOLD
  → Cryptova-Full: funding/volatility risk filter removes selected LONG signals
```

Raw measures the model itself. Base measures confidence-based signal selection. Full represents the completed research trading-decision path.

## How the model was developed

Cryptova was implemented as a sequence of explicit design steps rather than as one opaque block:

1. Define a 72-hour observation window and a 24-hour target horizon.
2. Convert the future return into three classes using fixed `±1.2%` boundaries.
3. Build an hourly chart tensor from 12 market features.
4. Build a timestamp-aligned hourly news tensor from nine aggregated sentiment features.
5. Encode the chart and news sequences independently.
6. Project both encodings into the same 64-dimensional space and fuse them at each timestamp.
7. Use a Fusion Transformer to model relationships across all 72 fused timestamps.
8. Train the fusion output together with chart-only and news-only auxiliary heads.
9. Select the neural checkpoint by Validation Macro F1.
10. Select confidence and risk-filter thresholds using Validation data only, then freeze them for Test.

The following sections document each step at implementation level.

## Task definition

Cryptova is a direct three-class classifier. At each prediction timestamp, it uses the preceding 72 hourly observations to estimate the direction of the following 24-hour return.

| Label ID | Signal | Target rule |
|---:|---|---|
| 0 | `SHORT` | future return `<= -1.2%` |
| 1 | `HOLD` | future return between `-1.2%` and `+1.2%` |
| 2 | `LONG` | future return `>= +1.2%` |

Unlike a return-forecasting model, Cryptova produces class logits and probabilities directly. It does not output a continuous predicted return.

## Input data

Each sample contains chart and news tensors aligned to the same 72 hourly timestamps.

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
| `hour_sin` | sine component of the cyclical hour encoding |
| `hour_cos` | cosine component of the cyclical hour encoding |
| `is_missing_candle` | missing-candle indicator |

### News features

| Feature | Interpretation |
|---|---|
| `news_presence` | whether news was observed during the hour |
| `news_count_log1p` | log-transformed article count |
| `finbert_mean` | mean FinBERT sentiment score |
| `finbert_sq_mean` | mean squared sentiment score |
| `finbert_pos_sum` | aggregated positive sentiment |
| `finbert_neg_sum` | aggregated negative sentiment |
| `pos_neg_count_imbalance` | imbalance between positive and negative article counts |
| `finbert_mean_ma_24h` | 24-hour moving average of mean sentiment |
| `news_count_sum_24h` | rolling 24-hour article count |

## Model architecture

```text
Chart (72 x 12)
  → TimesNet sequence encoder
  → chart projection (72 x 64) ──────────────┐
                                              ├─ per-timestamp concatenation
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

### Notation and tensor flow

Let `B` be the batch size, `T = 72` the hourly sequence length, and `H = 64` the shared fusion width. The model receives:

```text
X_chart ∈ R^(B x 72 x 12)
X_news  ∈ R^(B x 72 x 9)
```

The complete forward pass implemented by `ChartNewsTimeFusionTransformerClassifier` is:

| Stage | Operation | Output shape |
|---|---|---|
| Chart encoding | `TimesNetEncoder(X_chart)` | `(B, 72, 32)` |
| News input projection | `Linear(9, 32)` + learned positional embedding | `(B, 72, 32)` |
| News sequence encoding | one pre-norm Transformer encoder layer | `(B, 72, 32)` |
| Shared projections | separate `Linear(32, 64)` layers | two tensors of `(B, 72, 64)` |
| Pair construction | concatenate chart and news at each hour | `(B, 72, 128)` |
| Nonlinear mixing | `LayerNorm(128) → Linear(128,64) → GELU → Dropout` | `(B, 72, 64)` |
| Modality gate | `LayerNorm(128) → Linear(128,64) → Sigmoid` | `(B, 72, 64)` |
| Fused sequence | add the nonlinear and gated paths | `(B, 72, 64)` |
| Fusion input | prepend CLS and add learned positional embedding | `(B, 73, 64)` |
| Fusion Transformer | one pre-norm Transformer encoder layer | `(B, 73, 64)` |
| Global representation | concatenate CLS, mean, and last-step pools | `(B, 192)` |
| Main classifier | `LayerNorm(192) → Linear(192,64) → GELU → Dropout → Linear(64,3)` | `(B, 3)` |

The model rejects inputs whose time or feature dimensions differ from `(72,12)` and `(72,9)`. These checks are performed both when training arrays are loaded and inside the modality encoders.

### 1. Chart branch

The chart branch wraps the `TimesNetEncoder` implemented in [`chart_only/timesnet_encoder.py`](chart_only/timesnet_encoder.py).

```text
X_chart (B,72,12)
  → TimesNetEncoder(
        input_size=72,
        input_dim=12,
        h=24,
        hidden_size=32,
        conv_hidden_size=64,
        top_k=2,
        num_kernels=4,
        encoder_layers=1,
        expand_to_future=False,
        pre_norm=True,
        dropout=0.30
    )
  → C_seq (B,72,32)
```

Because `expand_to_future=False`, the chart encoder returns representations for the observed 72 timestamps instead of appending a 24-step forecast sequence. The target horizon remains 24 hours, so `h=24` is still passed to the encoder configuration.

The chart encoder processes the sequence as follows:

1. `DataEmbedding` projects the 12 features at each timestamp through `Linear(12,32)`.
2. A learned positional embedding of shape `(1,72,32)` is added, followed by dropout `0.30`.
3. `FFT_for_Period` applies `torch.fft.rfft` along the time dimension.
4. FFT amplitude is averaged across the batch and channels, the DC component is set to zero, and the two largest frequency components are selected.
5. Each selected frequency index `f_i` is converted to `period_i = floor(72 / f_i)`.
6. For every period, the sequence is zero-padded to a multiple of that period and reshaped into a two-dimensional representation of shape `(B,32,cycle,period)`.
7. Inception convolution blocks model within-period and across-period variation.
8. Each period-specific output is restored to `(B,72,32)` and combined using sample-specific softmax weights derived from FFT amplitude.
9. The encoder applies the pre-norm residual `x = x + TimesBlock(LayerNorm(x))`, followed by a final `LayerNorm(32)`.

The Fusion model uses `top_k=2`, `num_kernels=4`, `conv_hidden_size=64`, and `encoder_layers=1`. The four `Conv2d` branches in each Inception block use kernel sizes `1×1`, `3×3`, `5×5`, and `7×7`, then average their outputs. The first Inception block expands channels from `32 → 64`; after GELU and dropout, the second block reduces them from `64 → 32`.

Period weights are not fixed across the dataset. They are computed from each sample's FFT amplitude, so samples in the same batch can assign different importance to the selected period-specific outputs.

### 2. News branch

The news branch is fully defined by `NewsTransformerSequenceEncoder`:

1. Each nine-dimensional hourly news vector is projected by `Linear(9,32)`.
2. A learned positional tensor of shape `(1,72,32)`, initialized from `N(0,0.02)`, is added.
3. Dropout `0.30` is applied.
4. One `TransformerEncoderLayer` processes the sequence with `d_model=32`, four attention heads, a feed-forward width of `128`, GELU activation, dropout `0.30`, `batch_first=True`, and `norm_first=True`.
5. A final `LayerNorm(32)` produces `N_seq ∈ R^(B x 72 x 32)`.

With four heads and model width 32, each news attention head has width eight. No causal mask or padding mask is passed, so every timestamp can attend to all 72 positions inside the already-constructed historical window.

### 3. Shared projection and time-wise fusion

Separate linear layers project the chart and news encodings into the common width:

```text
C = W_c C_seq + b_c ∈ R^(B x 72 x 64)
N = W_n N_seq + b_n ∈ R^(B x 72 x 64)
P_t = concat(C_t, N_t) ∈ R^128
```

For each hour `t`, the model computes two complementary fusion paths:

```text
M_t = Dropout(GELU(W_m LayerNorm(P_t) + b_m))
G_t = sigmoid(W_g LayerNorm(P_t) + b_g)
R_t = G_t ⊙ C_t + (1 - G_t) ⊙ N_t
F_t = Dropout(M_t + R_t)
```

`M_t` is a nonlinear representation learned from the concatenated modalities. `G_t` is a 64-dimensional gate rather than a single scalar, allowing each hidden coordinate to select a different balance between chart and news. Values near one emphasize the chart coordinate; values near zero emphasize the news coordinate. The final token `F_t` adds the nonlinear mixed path and the gated residual path instead of selecting only one of them.

Fusion is aligned by timestamp. Chart hour `t` is paired only with news hour `t` before the cross-time Fusion Transformer is applied.

### 4. Fusion Transformer

A learned CLS token of shape `(1,1,64)` is expanded across the batch and prepended to the 72 fused tokens. A learned positional tensor of shape `(1,73,64)` is then added.

The 73-token sequence passes through one `TransformerEncoderLayer` configured as follows:

| Parameter | Value |
|---|---:|
| Model width | 64 |
| Attention heads | 4 |
| Width per head | 16 |
| Feed-forward width | 256 |
| Encoder layers | 1 |
| Activation | GELU |
| Dropout | 0.30 |
| Normalization | pre-norm, followed by final `LayerNorm(64)` |

No causal mask is used. This is appropriate for the implemented classification task because all 72 input hours precede the prediction timestamp; observations from the future target window never enter attention.

### 5. Three-way pooling and main classifier

The model retains three views of the Fusion Transformer output:

```text
h_cls  = output[:, 0, :]                 # learned global summary, (B,64)
h_mean = mean(output[:, 1:, :], dim=1)  # average historical state, (B,64)
h_last = output[:, -1, :]                # most recent hourly state, (B,64)
h_fuse = concat(h_cls, h_mean, h_last)  # (B,192)
```

`h_fuse` passes through `LayerNorm(192)`, `Linear(192,64)`, GELU, dropout, and `Linear(64,3)`. The three logits are ordered `[SHORT, HOLD, LONG]`. Softmax is applied outside the model during evaluation and runtime inference.

The three pooling paths give the classifier a learned sequence summary, a whole-window average, and an explicitly recent representation. The implementation does not add another attention-pooling layer after the Fusion Transformer.

### 6. Auxiliary modality heads

When `return_aux=True`, the forward pass also returns chart-only and news-only logits. These heads summarize the projected modality sequences before fusion:

```text
chart_summary = concat(mean(C, time), C_last) ∈ R^128
news_summary  = concat(mean(N, time), N_last) ∈ R^128
```

Each summary uses its own `LayerNorm(128) → Linear(128,64) → GELU → Dropout → Linear(64,3)` classifier. The auxiliary heads regularize both modality encoders during multi-head training. They are not averaged with the main logits during inference; the production signal uses only `signal_logits`.

### 7. Initialization

The CLS token and both learned positional embeddings use a zero-mean normal initialization with standard deviation `0.02`. The model's `_init_weights()` applies Xavier-uniform initialization to every `nn.Linear` module reachable in the assembled model and initializes linear biases to zero.

The implementation is in [`main_fusion/fusion_model.py`](main_fusion/fusion_model.py), and the runtime copy is in [`../cryptova-ai/fusion_model.py`](../cryptova-ai/fusion_model.py).

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

The main model returns raw logits by default. Passing `return_aux=True` returns `signal_logits`, `chart_logits`, and `news_logits` as separate `(B,3)` tensors.

## Training and model selection

[`main_fusion/train_fusion_model.py`](main_fusion/train_fusion_model.py) trains a separate model on each of three chronological rolling Train/Validation/Test splits.

### Expected files per rolling split

```text
rolling_N/
├─ X_chart_train.npy    # float32, (N_train,72,12)
├─ X_news_train.npy     # float32, (N_train,72,9)
├─ y_train.npy          # int64,   (N_train,)
├─ X_chart_val.npy
├─ X_news_val.npy
├─ y_val.npy
├─ X_chart_test.npy
├─ X_news_test.npy
├─ y_test.npy
├─ sample_meta_val.csv
└─ sample_meta_test.csv
```

The loader verifies equal sample counts, exact three-dimensional input shapes, and finite values. Training batches are shuffled; Validation and Test batches are not. `num_workers=0` is used, and CUDA pinning is enabled only when a CUDA device is selected.

### Training objective

The same unweighted cross-entropy criterion with label smoothing `0.03` is applied to all three heads. Class weights are computed for reference but disabled by `USE_CLASS_WEIGHTS=False` in the recorded configuration.

```text
L_signal = CE(signal_logits, y)
L_chart  = CE(chart_logits, y)
L_news   = CE(news_logits, y)

L_total = 0.60 L_signal + 0.20 L_chart + 0.20 L_news
```

The larger main-head weight keeps the fused prediction as the primary objective while requiring each modality branch to retain independently predictive information.

### Optimizer and checkpoint selection

| Item | Implemented value |
|---|---:|
| Optimizer | AdamW |
| Learning rate | `1e-4` |
| Weight decay | `1e-4` |
| Batch size | 64 |
| Maximum epochs | 50 |
| Early-stopping patience | 8 epochs |
| Checkpoint metric | Validation Macro F1 from main-head argmax |
| LR scheduler | ReduceLROnPlateau, mode `max`, factor `0.5`, patience `3` |
| Gradient clipping | global norm `1.0` |
| Mixed precision | CUDA autocast and GradScaler when CUDA is available |
| Seed | 42 |

Python, NumPy, CPU Torch, and all CUDA devices receive the same seed. cuDNN benchmarking is disabled and deterministic mode is enabled. The best state is copied whenever Validation Macro F1 strictly improves, restored after early stopping, and saved as `best_model.pt`.

Model and confidence-threshold selection use Validation data only. Test data is reserved for the final report. The training script expects prebuilt rolling tensors and metadata; its data paths must be configured for the local or Colab environment before execution.

## Signal stages

| Variant | Decision rule | Purpose |
|---|---|---|
| Cryptova-Raw | select the class with the highest probability | evaluate the direct classifier output |
| Cryptova-Base | change predictions below the Validation-selected confidence threshold to `HOLD` | measure confidence filtering |
| Cryptova-Full | add funding-rate and volatility filters to Base | evaluate the completed research signal path |

Funding rate and volatility are external risk filters, not additional Fusion-model inputs. The runtime inference copy currently uses confidence threshold `0.46`; the research evaluation selects a separate threshold within each rolling Validation period and freezes it for the corresponding Test period.

### Confidence-threshold selection

Argmax always chooses one class even when the three probabilities are nearly tied. For example, `[0.34, 0.33, 0.33]` becomes `SHORT`, although the model has little evidence for distinguishing that direction from `HOLD` or `LONG`. Executing every such low-confidence directional output can create unnecessary positions and repeatedly incur fees and slippage.

The confidence threshold was introduced to separate **direction prediction** from **trade eligibility**. Its purpose is not to increase the model's raw classification score. It suppresses uncertain directional predictions, reduces avoidable turnover, and keeps only signals for which the model expresses sufficient conviction.

```text
Fusion probabilities
→ Is the highest probability sufficiently confident?
   ├─ Yes: keep SHORT or LONG
   └─ No:  convert the prediction to HOLD
```

For every Validation sample, `confidence = max(softmax(logits))`. If confidence is below a candidate threshold, the predicted class is changed to `HOLD`. The candidate grid is:

```text
0.34, 0.36, 0.38, 0.40, 0.42, 0.44, 0.46, 0.48,
0.50, 0.52, 0.55, 0.60, 0.65, 0.70, 0.75
```

Candidates with a non-overlapping trade ratio outside `[0.01, 0.30]` are discarded when possible. The remaining candidates are sorted lexicographically by average trade return, cumulative return, Sharpe-like score, win rate, Validation Macro F1, and proximity of the trade ratio to `0.05`. The selected threshold is then applied unchanged to Test predictions.

In the connected evaluation, confidence filtering reduced the number of trades from 178 to 158 and changed the cost-adjusted return from `-18.11%` to `+7.42%`, while Macro F1 decreased slightly from `0.381875` to `0.376506`. This is consistent with the intended role of the threshold: it improved trade selection by rejecting uncertain signals rather than improving the neural classifier itself.

### Funding and volatility filter

Confidence alone does not describe how market participants are positioned. Validation-period error analysis indicated that some accepted LONG signals produced unnecessary exposure. Cryptova-Full therefore adds a separate positioning-aware decision layer after confidence filtering.

Funding rate has a deliberately limited role in this system:

- it is **not** one of the 12 chart or nine news inputs to the Fusion model;
- it is **not** forecast by the model;
- it is **not** accumulated as a realized funding payment;
- it is **not** deducted from the reported backtest return;
- it is used only as an external proxy for market positioning and potential LONG crowding.

Accordingly, Cryptova-Full is a **positioning-aware signal-filtering system**, not a funding-cost-adjusted return model. The neural network predicts direction from chart and news data; the external filter then asks whether an otherwise accepted LONG signal remains suitable given current positioning conditions.

```text
Chart + News Fusion model
→ directional probabilities
→ confidence-based trade eligibility
→ funding/volatility positioning check
→ final SHORT / HOLD / LONG signal
```

A high positive funding rate is treated as evidence that LONG positioning may be crowded. High funding by itself does not necessarily invalidate a LONG signal because it can also occur during a strong trend. Low volatility by itself is also insufficient because it may simply describe a stable market. The implemented hypothesis is narrower: when funding is high but volatility is low, LONG positioning may be crowded without enough price movement to justify additional exposure. Such LONG predictions are converted to `HOLD`.

Cryptova-Full starts from the confidence-filtered predictions. The risk-filter script searches funding thresholds from `-0.0002` through `0.0010` and volatility thresholds from `0.008` through `0.025` on Validation data. The implemented rule is directional and asymmetric:

```text
if prediction == LONG
   and funding_rate > selected_funding_threshold
   and std_24h < selected_volatility_threshold:
       prediction = HOLD
```

It does not modify `SHORT` or existing `HOLD` predictions. This asymmetry reflects the specific unnecessary-LONG pattern identified during Validation analysis; it does not establish that SHORT signals are inherently safe. A symmetric crowded-SHORT rule would be a separate strategy and would require its own Validation design and untouched evaluation.

The threshold pair is selected lexicographically by Validation average trade return, cumulative return, Sharpe-like score, and maximum drawdown, then frozen for Test. From Base to Full, the filter reduced trades from 158 to 119, increased the connected cost-adjusted return from `+7.42%` to `+27.46%`, and improved maximum drawdown from `-37.38%` to `-24.40%`. At the same time, LONG recall fell from `0.3062` to `0.1724` and Macro F1 fell from `0.376506` to `0.350898`. The filter therefore improved the selected trading path by reducing LONG exposure; it did not improve the model's directional classification ability.

Because the filter structure and thresholds were developed from Validation performance, the result may contain Validation-selection bias. The LONG-only positioning rule should be treated as exploratory until it is confirmed without modification on a newly untouched holdout period.

### Non-overlapping backtest

`LONG` receives position `+1`, `SHORT` receives `-1`, and `HOLD` opens no position. After an entry, signals before that row's `target_time` are ignored, implementing the 24-hour cooldown. Per-trade strategy return is:

```text
strategy_return = position × raw_future_return - 0.001 fee - 0.001 slippage
```

The reported cumulative return compounds these row-level strategy returns. The script also reports a Sharpe-like annualization using `sqrt(365 × 24)`, maximum drawdown, trade count and ratio, win rate, and average trade return. This is a research backtest convention rather than a claim of executable live fills.

## Evaluation design

Cryptova's saved predictions were later converted to a common schema and independently re-evaluated without retraining or re-running inference. This preserved the original model and checkpoints while allowing Raw, Base, and Full to be measured with the same evaluator.

| Item | Evaluation setting |
|---|---|
| Market | Bitcoin, hourly observations |
| Input | previous 72 hours of chart and news features |
| Target | `SHORT/HOLD/LONG` derived from the future 24-hour return |
| Splits | three chronological rolling Train/Validation/Test windows |
| Checkpoint selection | Validation Macro F1 only |
| Threshold selection | Validation backtest only |
| Final connected Test set | 6,291 out-of-sample timestamps |
| Position rule | 24-hour non-overlapping positions |
| Cost | 0.1% fee + 0.1% slippage per selected trade |

### Rolling periods

All timestamps are UTC, and each end boundary is exclusive.

| Rolling | Train | Validation | Test |
|---|---|---|---|
| 1 | 2024-01-01 → 2025-04-01 | 2025-04-01 → 2025-07-01 | 2025-07-01 → 2025-10-01 |
| 2 | 2024-04-01 → 2025-07-01 | 2025-07-01 → 2025-10-01 | 2025-10-01 → 2026-01-01 |
| 3 | 2024-07-01 → 2025-10-01 | 2025-10-01 → 2026-01-01 | 2026-01-01 → 2026-04-01 |

## Results

### What the neural model learned: Cryptova-Raw

Raw applies only `argmax` to the Fusion model's probabilities. It is the clearest measurement of the learned classifier because no confidence or market-risk rule changes its output.

| Scope | Rows | Accuracy | Balanced accuracy | Macro F1 | SHORT recall | HOLD recall | LONG recall |
|---|---:|---:|---:|---:|---:|---:|---:|
| Connected OOS | 6,291 | 0.460817 | 0.393802 | 0.381875 | 0.1571 | 0.6716 | 0.3527 |

Raw's strongest directional recall was LONG at `0.3527`, while SHORT recall remained low at `0.1571`. Its class-level results show that the Fusion classifier learned more than a HOLD-only policy, but its unfiltered trading path lost `18.11%` after the specified costs.

### Effect of each decision layer

All three variants use the same trained Fusion checkpoint. Base and Full are not separately trained models; they are successive decision layers applied to the saved probabilities.

| Metric | Raw: model argmax | Base: + confidence | Full: + risk filter |
|---|---:|---:|---:|
| Accuracy | 0.460817 | 0.471308 | **0.477984** |
| Balanced accuracy | **0.393802** | 0.389647 | 0.368649 |
| Macro F1 | **0.381875** | 0.376506 | 0.350898 |
| SHORT recall | **0.1571** | 0.1426 | 0.1426 |
| HOLD recall | 0.6716 | 0.7202 | **0.7910** |
| LONG recall | **0.3527** | 0.3062 | 0.1724 |
| Cost-adjusted return | -18.11% | +7.42% | **+27.46%** |
| Sharpe-like | -0.545 | +0.446 | **+1.143** |
| Maximum drawdown | -36.74% | -37.38% | **-24.40%** |
| Trades | 178 | 158 | 119 |
| Trade ratio | 2.83% | 2.51% | 1.89% |
| Win rate | 48.31% | 48.10% | **55.46%** |
| Average trade return | -0.083% | +0.080% | **+0.240%** |

Confidence filtering converted uncertain directional predictions to `HOLD`, reducing trades from 178 to 158 and changing the connected return from `-18.11%` to `+7.42%`. The funding/volatility layer removed additional LONG predictions, reducing the trade count to 119 and increasing the connected return to `+27.46%` while reducing maximum drawdown to `-24.40%`.

This improvement did not come from better three-class prediction. Macro F1 and Balanced Accuracy decreased as more directional outputs became `HOLD`. The result instead shows that the classification objective and the economic trade-selection objective are different.

### Cryptova-Full by Test period

| Rolling | Rows | Accuracy | Balanced accuracy | Macro F1 | Return | Sharpe-like | MDD | Trades | Win rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2,113 | 0.639375 | 0.334182 | 0.261728 | -0.13% | -0.107 | -1.53% | 2 | 50.00% |
| 2 | 2,113 | 0.409844 | 0.347294 | 0.294403 | -18.04% | -1.919 | -24.40% | 61 | 49.18% |
| 3 | 2,065 | 0.382567 | 0.353066 | 0.349761 | +55.72% | +4.321 | -9.36% | 56 | 62.50% |
| **Connected OOS** | **6,291** | **0.477984** | **0.368649** | **0.350898** | **+27.46%** | **+1.143** | **-24.40%** | **119** | **55.46%** |

The connected result is positive, but it is not stable across periods. Rolling 1 contains only two trades, Rolling 2 loses `18.04%`, and the overall gain depends heavily on Rolling 3's `55.72%` return. Full's average return of `+0.240%` per selected trade only modestly exceeds the assumed `0.20%` round-trip cost.

### What can be concluded

The experiment supports three limited conclusions about Cryptova:

1. The Raw chart-and-news Fusion network learned a nontrivial three-class signal, with its strongest pure-model classification results appearing before post-processing.
2. Confidence filtering and the asymmetric risk filter improved the selected trading path by reducing exposure, not by increasing Macro F1.
3. The final Full system showed promising connected OOS performance, but large rolling-period variation means stable profitability has not been established.

After Cryptova was completed, it was included in the separate [Financial Forecasting Benchmark](https://github.com/junghokim0/financial-forecasting-benchmark) for comparison with Ridge, LSTM, TimesNet, Chronos-2, and TimesFM under a common protocol. Cross-model tables belong in the Benchmark repository; this document remains focused on how Cryptova itself was built and what its own ablations produced.

## Reproduction files

```text
main_fusion/fusion_model.py
main_fusion/train_fusion_model.py
main_fusion/export_original12_predictions.py
main_fusion/backtest_original12_funding_vol_filter.py
```

This repository includes the TimesNet encoder, model implementation, market and news collection code, preprocessing code, and rolling-dataset builder. It does not include generated training arrays (`*.npy`), trained checkpoints (`*.pt`), API credentials, or provider-licensed raw news content.

The architecture and training procedure can therefore be inspected in code, but training or real inference from a fresh clone requires separately prepared data and a trained checkpoint. The public [Financial Forecasting Benchmark](https://github.com/junghokim0/financial-forecasting-benchmark) repository provides Cryptova evaluation prediction CSVs, the common evaluator, and evaluation results, but not the original training data or model weights.

## Interpretation limits

The results describe performance under the stated periods, target, evaluator, and cost assumptions. They do not prove future profitability, isolate the effect of news or architecture, establish superiority for other assets or horizons, or quantify repeated-seed uncertainty. Neural-model results were primarily produced with seed 42. Repeated-seed analysis and a newly separated untouched holdout remain future work.
