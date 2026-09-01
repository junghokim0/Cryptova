# Cryptova

**Explainable chart-and-news AI for cryptocurrency signal research and paper trading.**

Cryptova combines hourly Bitcoin market features with aggregated financial-news sentiment to predict one of three 24-hour market signals: `SHORT`, `HOLD`, or `LONG`. The repository contains the fusion-model research code and a local web application for inspecting signals, configuring risk controls, running paper-trading workflows, and reviewing backtests.

![Cryptova application](cryptova-ui/src/assets/hero.png)

> [!WARNING]
> Cryptova is an educational and research project. Its signals and backtests are not financial advice, do not guarantee future performance, and should not be used as the sole basis for live trading.

## System overview

```text
Previous 72 hours
├─ 12 chart features ── TimesNet chart encoder ───────┐
└─  9 news features ── News Transformer encoder ─────┤
                                                       ▼
                                      gated time-wise fusion
                                                       ▼
                                         Fusion Transformer
                                                       ▼
                                  SHORT / HOLD / LONG probabilities
                                                       ▼
                                  confidence + optional risk filters
                                                       ▼
                              Paper Trading / History / Backtest UI
```

The chart and news sequences are combined by the AI server, which returns signal probabilities and confidence to the backend. The backend then applies the user's strategy and risk rules before recording a paper-trading action. Model architecture, features, training, and evaluation details are kept in [`trading/README.md`](trading/README.md).

## Main features

- Three-class `SHORT/HOLD/LONG` inference from chart and news inputs
- Confidence-based conversion of uncertain predictions to `HOLD`
- Optional funding-rate and volatility risk filtering
- User registration and JWT-based authentication
- Strategy configuration and scheduled or one-off paper-trading runs
- Paper positions, portfolio summaries, execution history, and chart markers
- Historical backtesting and saved result inspection
- Bybit public-market integration and optional Gemini-generated explanations

## Research validation

Cryptova was evaluated in the separate [Financial Forecasting Benchmark](https://github.com/junghokim0/financial-forecasting-benchmark) using the same 6,291 connected test timestamps, a 24-hour forecast horizon, three chronological rolling splits, validation-only model selection, non-overlapping 24-hour positions, and 0.2% total cost per selected trade.

| Cryptova variant | Signal path | Macro F1 | Balanced accuracy | Cost-adjusted return |
|---|---|---:|---:|---:|
| Raw | direct class, argmax | **0.381875** | **0.393802** | -18.11% |
| Base | confidence filter | 0.376506 | 0.389647 | +7.42% |
| Full | confidence + funding/volatility filters | 0.350898 | 0.368649 | **+27.46%** |

These are exploratory single-seed research results, not evidence of guaranteed profitability. See [`trading/README.md`](trading/README.md) and the benchmark repository for the model variants, comparison table, protocol, assumptions, and limitations.

## Application architecture

| Component | Technology | Responsibility |
|---|---|---|
| Frontend | React, Vite, Lightweight Charts | Trading, History, and Backtest interfaces |
| Backend | FastAPI, SQLAlchemy, MySQL | Authentication, strategies, signals, positions, paper trading, and backtests |
| AI server | FastAPI, PyTorch | Loads the trained fusion model and returns signal probabilities |
| External services | Bybit, optional Gemini | Public market data, exchange account access, and signal explanations |

The backend runs on port `8000`, the AI server on `8001`, and the frontend development server on `5173` by default.

### Runtime flow

1. The user registers or logs in and saves strategy settings.
2. A one-off or scheduled trading run asks the AI server for the latest signal.
3. The AI server reads the aligned 72-hour chart/news window and returns class probabilities.
4. The backend applies confidence and risk rules, then records a paper action or `HOLD` decision.
5. The frontend displays the current position, portfolio, execution history, markers, and backtest results.

### Main API groups

| Prefix | Responsibility |
|---|---|
| `/auth` | registration, login, and current-user authentication |
| `/strategy` | user strategy settings |
| `/signals` | signal generation and history |
| `/trading` | one-off and scheduled paper-trading runs |
| `/positions` | paper positions, PnL, and portfolio summary |
| `/market` | public candlestick data |
| `/backtest` | backtest execution and saved results |
| `/exchange` | optional encrypted exchange-key and account access |

## Repository layout

```text
cryptova-ai/              AI inference API and fusion-model definition
cryptova-back/            FastAPI application and database-backed services
cryptova-ui/              React/Vite web interface
trading/                  Model documentation and research code
trading/main_fusion/      Training, prediction export, and risk-filter backtest
install.md                Detailed local installation and run guide
```

## Quick start

Cryptova is a multi-service application and requires Python 3.10+, Node.js 18+, npm, MySQL 8.x, the trained checkpoint, the TimesNet chart encoder, and prepared inference features. Follow [`install.md`](install.md) for the complete setup.

After configuring the required local artifacts and backend `.env` file, start the services in separate terminals:

```powershell
# Backend
cd cryptova-back
python -m uvicorn app.main:app --reload

# AI server
cd cryptova-ai
python -m uvicorn main:app --port 8001 --reload

# Frontend
cd cryptova-ui
npm run dev
```

Then open `http://localhost:5173`. Backend OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

## Research and runtime artifacts

The repository includes the model definition, training workflow, prediction export code, risk-filter backtest, backend, and frontend. Large or sensitive artifacts are intentionally excluded by `.gitignore`, including:

- raw and processed datasets under `data/`
- trained checkpoints under `models/`
- the local `chart_only/` TimesNet encoder dependency
- `.env` files and API credentials

Consequently, a fresh clone is suitable for source inspection but is **not inference-ready until those artifacts are supplied**. The public benchmark publishes evaluation-ready prediction artifacts and evaluator code separately; it does not make this repository's omitted datasets, provider-licensed news content, or trained weights public.

## Documentation

- [`install.md`](install.md) — local installation, configuration, startup, testing, and troubleshooting
- [`trading/README.md`](trading/README.md) — model architecture, feature schema, training, variants, and evaluation

## License and disclaimer

No repository-wide open-source license has been granted at this time. Contact the author before reuse or redistribution. This project is for research and educational use only and does not constitute financial advice.
