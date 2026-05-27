import { useEffect, useMemo, useState } from "react";
import "../styles/BacktestPage.css";
import logo from "../assets/logo.png";
import { getBacktestResults, runBacktest } from "../api/backtestApi";
import AssetSummary from "../components/AssetSummary";
const BACKTEST_START_DATE = "2026-01-03";
const BACKTEST_END_DATE = "2026-03-30";

const initialSettings = {
  confidence: 46,
  holdingPeriod: 24,
  positionSize: 1,
  maxDrawdown: -10,
};

const defaultResult = {
  total_return: 0,
  cagr: 0,
  sharpe: 0,
  mdd: 0,
  win_rate: 0,
  trade_count: 0,
  start_date: BACKTEST_START_DATE,
  end_date: BACKTEST_END_DATE,
  created_at: null,
  confidence_threshold: 46,
  position_size: 1,
  max_drawdown_stop: -10,
  result_json: {
    equity_curve: [
      { date: BACKTEST_START_DATE, value: 10000 },
      { date: BACKTEST_END_DATE, value: 10000 },
    ],
    monthly_returns: [],
    trade_stats: {
      long_count: 0,
      short_count: 0,
      hold_count: 0,
      long_win_rate: 0,
      short_win_rate: 0,
      avg_holding_time: "24.0h",
      avg_win: "+0.00%",
      avg_loss: "0.00%",
      profit_factor: 0,
    },
    top_winning_trades: [],
    top_losing_trades: [],
    trade_samples: [],
  },
};

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
}

function formatMoney(value) {
  const number = Number(value || 0);

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function makePolylinePoints(data, width = 800, height = 300) {
  if (!data || data.length === 0) return "";

  const paddingX = 10;
  const paddingY = 22;

  const values = data.map((item) => Number(item.value));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  return data
    .map((item, index) => {
      const x =
        paddingX +
        (index / Math.max(data.length - 1, 1)) * (width - paddingX * 2);

      const normalized = (Number(item.value) - minValue) / range;

      const y = height - paddingY - normalized * (height - paddingY * 2);

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function makeDrawdownPath(data, width = 260, height = 150) {
  if (!data || data.length === 0) {
    return `M0 ${height} L${width} ${height} L${width} ${height} L0 ${height} Z`;
  }

  let peak = Number(data[0].value);
  const drawdowns = data.map((item) => {
    const value = Number(item.value);
    peak = Math.max(peak, value);

    if (peak <= 0) return 0;

    return ((value / peak) - 1) * 100;
  });

  const minDrawdown = Math.min(...drawdowns, -0.01);
  const maxDrawdown = 0;
  const range = maxDrawdown - minDrawdown || 1;

  const points = drawdowns.map((dd, index) => {
    const x = (index / Math.max(drawdowns.length - 1, 1)) * width;
    const normalized = (dd - minDrawdown) / range;
    const y = 20 + (1 - normalized) * (height - 35);

    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  return `M${points.join(" L")} L${width} ${height} L0 ${height} Z`;
}

function makeEquityDateLabels(equityCurve) {
  if (!equityCurve || equityCurve.length === 0) return [];

  const labelCount = Math.min(6, equityCurve.length);
  const labels = [];

  for (let i = 0; i < labelCount; i += 1) {
    const index = Math.floor(
      (i / Math.max(labelCount - 1, 1)) * (equityCurve.length - 1)
    );

    labels.push(equityCurve[index]?.date || "");
  }

  return labels;
}

function makeReturnDistribution(tradeSamples) {
  if (!tradeSamples || tradeSamples.length === 0) {
    return [10, 10, 10, 10, 10, 10, 10];
  }

  const returns = tradeSamples
    .map((trade) => Number(trade.equity_return_pct))
    .filter((value) => Number.isFinite(value));

  if (returns.length === 0) {
    return [10, 10, 10, 10, 10, 10, 10];
  }

  const bins = [0, 0, 0, 0, 0, 0, 0];

  returns.forEach((value) => {
    if (value <= -2) bins[0] += 1;
    else if (value <= -1) bins[1] += 1;
    else if (value < 0) bins[2] += 1;
    else if (value === 0) bins[3] += 1;
    else if (value < 1) bins[4] += 1;
    else if (value < 2) bins[5] += 1;
    else bins[6] += 1;
  });

  const maxCount = Math.max(...bins, 1);

  return bins.map((count) => Math.max(8, (count / maxCount) * 100));
}

function getAverageTradeReturn(tradeSamples) {
  if (!tradeSamples || tradeSamples.length === 0) return 0;

  const returns = tradeSamples
    .map((trade) => Number(trade.equity_return_pct))
    .filter((value) => Number.isFinite(value));

  if (returns.length === 0) return 0;

  return returns.reduce((sum, value) => sum + value, 0) / returns.length;
}

function BacktestPage({
  user,
  onGoHome,
  onGoTrading,
  onGoHistory,
  onGoLogin,
  onLogout,
}) {
  
  const [settings, setSettings] = useState(initialSettings);

  const [currentResult, setCurrentResult] = useState(defaultResult);
  const [isRunning, setIsRunning] = useState(false);
  const [backtestMessage, setBacktestMessage] = useState("");
  const [backtestError, setBacktestError] = useState("");

  const resultJson = currentResult?.result_json || {};

  const equityCurve = useMemo(() => {
    return resultJson.equity_curve || defaultResult.result_json.equity_curve;
  }, [resultJson.equity_curve]);

  const equityPolylinePoints = useMemo(() => {
    return makePolylinePoints(equityCurve, 800, 300);
  }, [equityCurve]);

  const drawdownPath = useMemo(() => {
    return makeDrawdownPath(equityCurve, 260, 150);
  }, [equityCurve]);

  const equityDateLabels = useMemo(() => {
    return makeEquityDateLabels(equityCurve);
  }, [equityCurve]);

  const monthlyReturns = useMemo(() => {
    return resultJson.monthly_returns || defaultResult.result_json.monthly_returns;
  }, [resultJson.monthly_returns]);

  const tradeStats = useMemo(() => {
    return resultJson.trade_stats || defaultResult.result_json.trade_stats;
  }, [resultJson.trade_stats]);

  const topWinningTrades = useMemo(() => {
    return (
      resultJson.top_winning_trades ||
      defaultResult.result_json.top_winning_trades
    );
  }, [resultJson.top_winning_trades]);

  const topLosingTrades = useMemo(() => {
    return (
      resultJson.top_losing_trades || defaultResult.result_json.top_losing_trades
    );
  }, [resultJson.top_losing_trades]);

  const tradeSamples = useMemo(() => {
    return resultJson.trade_samples || [];
  }, [resultJson.trade_samples]);

  const returnDistribution = useMemo(() => {
    return makeReturnDistribution(tradeSamples);
  }, [tradeSamples]);

  const averageTradeReturn = useMemo(() => {
    return getAverageTradeReturn(tradeSamples);
  }, [tradeSamples]);

  useEffect(() => {
    async function loadLatestBacktest() {
      if (!user) return;

      try {
        const results = await getBacktestResults();

        if (results.length > 0) {
          setCurrentResult(results[0]);

          setSettings((prev) => ({
            ...prev,
            confidence: Number(results[0].confidence_threshold ?? prev.confidence),
            positionSize: Number(results[0].position_size ?? prev.positionSize),
            maxDrawdown: Number(
              results[0].max_drawdown_stop ?? prev.maxDrawdown
            ),
          }));
        }
      } catch (error) {
        setBacktestError(error.message || "Failed to load backtest results.");
      }
    }

    loadLatestBacktest();
  }, [user]);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetSettings = () => {
    setSettings(initialSettings);
    setBacktestMessage("");
    setBacktestError("");
  };

  const handleRunBacktest = async () => {
    setBacktestMessage("");
    setBacktestError("");

    if (!user) {
      setBacktestError("Please login before running backtest.");
      return;
    }

    try {
      setIsRunning(true);

      const result = await runBacktest({
        symbol: "BTCUSDT",
        start_date: BACKTEST_START_DATE,
        end_date: BACKTEST_END_DATE,
        confidence_threshold: settings.confidence,
        position_size: settings.positionSize,
        max_drawdown_stop: settings.maxDrawdown,
      });

      setCurrentResult(result);
      setBacktestMessage("Backtest completed and saved successfully.");
    } catch (error) {
      setBacktestError(error.message || "Failed to run backtest.");
    } finally {
      setIsRunning(false);
    }
  };



  return (
    <div className="backtest-page">
      <div className="backtest-bg-grid" />
      <div className="backtest-glow backtest-glow-left" />
      <div className="backtest-glow backtest-glow-right" />

      <header className="backtest-navbar">
        <button type="button" className="backtest-logo-button" onClick={onGoHome}>
          <img src={logo} alt="Cryptova Logo" className="backtest-logo" />
        </button>

        <nav className="backtest-nav-menu">
          <button className="backtest-nav-link" onClick={onGoTrading}>
            Trading
          </button>
          <button className="backtest-nav-link" onClick={onGoHistory}>
            History
          </button>
          <button className="backtest-nav-link active">Backtest</button>
        </nav>

        <AssetSummary user={user} />

        <button className="icon-button">♧</button>
        <button className="icon-button">⚙</button>

        {user ? (
          <button
            type="button"
            className="profile-button logout-profile"
            onClick={onLogout}
          >
            Logout
          </button>
        ) : (
          <button type="button" className="profile-button" onClick={onGoLogin}>
            Login
          </button>
        )}
      </header>

      <main className="backtest-layout">
        <aside className="backtest-sidebar">
          <div className="sidebar-title-row">
            <h2>Strategy Settings</h2>
            <button type="button" onClick={resetSettings}>
              ⟳ Reset
            </button>
          </div>

          <section className="sidebar-section">
            <h3>1. Signal & Risk Settings</h3>

            <div className="bt-setting-block">
              <div className="bt-setting-label">
                <span>Confidence Threshold</span>
                <b>{settings.confidence}%</b>
              </div>

              <input
                type="range"
                min="30"
                max="90"
                step="1"
                value={settings.confidence}
                onChange={(e) =>
                  updateSetting("confidence", Number(e.target.value))
                }
                style={{
                  "--value": `${((settings.confidence - 30) / 60) * 100}%`,
                }}
              />

              <div className="range-scale">
                <span>30%</span>
                <span>46%</span>
                <span>90%</span>
              </div>

              <p>
                Minimum confidence level for signal activation. The recommended
                threshold from validation is 46%.
              </p>
            </div>

            <div className="bt-setting-block">
              <div className="bt-setting-label">
                <span>Holding Period</span>
              </div>
              <div className="fixed-value-box">24h Fixed</div>
              <p>All positions are assumed to be held for 24 hours.</p>
            </div>

            <div className="bt-setting-block">
              <div className="bt-setting-label">
                <span>Position Size</span>
                <b>{settings.positionSize}%</b>
              </div>

              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={settings.positionSize}
                onChange={(e) =>
                  updateSetting("positionSize", Number(e.target.value))
                }
                style={{
                  "--value": `${((settings.positionSize - 1) / 19) * 100}%`,
                }}
              />

              <div className="range-scale">
                <span>1%</span>
                <span>5%</span>
                <span>20%</span>
              </div>

              <p>Capital ratio used for each simulated trade.</p>
            </div>

            <div className="bt-setting-block">
              <div className="bt-setting-label">
                <span>Max Drawdown Stop</span>
                <b>{settings.maxDrawdown}%</b>
              </div>

              <input
                type="range"
                min="-30"
                max="-5"
                step="1"
                value={settings.maxDrawdown}
                onChange={(e) =>
                  updateSetting("maxDrawdown", Number(e.target.value))
                }
                style={{
                  "--value": `${((settings.maxDrawdown + 30) / 25) * 100}%`,
                }}
              />

              <div className="range-scale">
                <span>-30%</span>
                <span>-10%</span>
                <span>-5%</span>
              </div>

              <p>Stop backtest when cumulative loss exceeds this threshold.</p>
            </div>
          </section>

          <section className="sidebar-section">
            <h3>2. Risk Filter</h3>

            <div className="filter-rule-box">
              <h4>Default Risk Filter</h4>
              <p>
                Funding and volatility joint filter is automatically applied to
                reduce risky LONG entries.
              </p>
              <code>
                high funding + low volatility
                <br />
                → LONG signal converted to HOLD
              </code>
            </div>
          </section>

          <button
            type="button"
            className="run-backtest-button"
            onClick={handleRunBacktest}
            disabled={isRunning}
          >
            {isRunning ? "Running..." : "Run Backtest ▶"}
          </button>

          {backtestMessage && (
            <p className="backtest-success-message">{backtestMessage}</p>
          )}

          {backtestError && (
            <p className="backtest-error-message">{backtestError}</p>
          )}

          <p className="data-period">
            Available test period: {BACKTEST_START_DATE} ~ {BACKTEST_END_DATE}
          </p>
        </aside>

        <section className="backtest-dashboard">
          <div className="dashboard-title-row">
            <div>
              <h1>Backtest Result Summary</h1>
              <span>
                {currentResult.start_date} ~ {currentResult.end_date}{" "}
                (24h Non-overlap)
              </span>
            </div>
            <p>Last updated: {formatDateTime(currentResult.created_at)} ⟳</p>
          </div>

          <section className="summary-grid">
            <article>
              <p>Total Return</p>
              <strong
                className={
                  Number(currentResult.total_return) >= 0 ? "positive" : "negative"
                }
              >
                {Number(currentResult.total_return) >= 0 ? "+" : ""}
                {Number(currentResult.total_return).toFixed(2)}%
              </strong>
              <span>Cumulative Return</span>
            </article>

            <article>
              <p>CAGR</p>
              <strong
                className={
                  Number(currentResult.cagr) >= 0 ? "positive" : "negative"
                }
              >
                {Number(currentResult.cagr) >= 0 ? "+" : ""}
                {Number(currentResult.cagr).toFixed(2)}%
              </strong>
              <span>Annualized Return</span>
            </article>

            <article>
              <p>Sharpe Ratio</p>
              <strong>{Number(currentResult.sharpe).toFixed(2)}</strong>
              <span>Risk-adjusted</span>
            </article>

            <article>
              <p>Max Drawdown</p>
              <strong className="negative">
                {Number(currentResult.mdd).toFixed(2)}%
              </strong>
              <span>MDD</span>
            </article>

            <article>
              <p>Win Rate</p>
              <strong>{Number(currentResult.win_rate).toFixed(2)}%</strong>
              <span>Winning Trades</span>
            </article>

            <article>
              <p>Trade Count</p>
              <strong>{currentResult.trade_count}</strong>
              <span>Total Trades</span>
            </article>
          </section>

          <section className="main-backtest-grid">
            <article className="equity-card">
              <div className="card-title-row">
                <h2>Equity Curve</h2>
                <div className="period-buttons">
                  <button>All</button>
                  <button>6M</button>
                  <button>1Y</button>
                  <button className="active">Test</button>
                </div>
              </div>

              <div className="equity-chart">
                <svg viewBox="0 0 800 330" preserveAspectRatio="none">
                  <g className="bt-grid-lines">
                    <line x1="0" y1="60" x2="800" y2="60" />
                    <line x1="0" y1="120" x2="800" y2="120" />
                    <line x1="0" y1="180" x2="800" y2="180" />
                    <line x1="0" y1="240" x2="800" y2="240" />
                    <line x1="0" y1="300" x2="800" y2="300" />
                  </g>

                  <polyline
                    className="equity-line"
                    points={equityPolylinePoints}
                  />
                </svg>

                <div className="chart-months">
                  {equityDateLabels.map((date, index) => (
                    <span key={`${date}-${index}`}>{date}</span>
                  ))}
                </div>
              </div>
            </article>

            <article className="trade-stats-card">
              <h2>Trade Statistics</h2>

              <div className="donut-wrap">
                <div className="donut-chart">
                  <div>
                    <span>Total</span>
                    <strong>{currentResult.trade_count}</strong>
                  </div>
                </div>

                <ul>
                  <li>
                    <b className="green-dot" /> LONG ({tradeStats.long_count})
                  </li>
                  <li>
                    <b className="red-dot" /> SHORT ({tradeStats.short_count})
                  </li>
                  <li>
                    <b className="gray-dot" /> HOLD ({tradeStats.hold_count})
                  </li>
                </ul>
              </div>

              <div className="stats-list">
                <p>
                  <span>LONG Win Rate</span>
                  <strong className="positive">
                    {tradeStats.long_win_rate}%
                  </strong>
                </p>
                <p>
                  <span>SHORT Win Rate</span>
                  <strong className="positive">
                    {tradeStats.short_win_rate}%
                  </strong>
                </p>
                <p>
                  <span>Avg Holding Time</span>
                  <strong>{tradeStats.avg_holding_time}</strong>
                </p>
                <p>
                  <span>Avg Win</span>
                  <strong className="positive">{tradeStats.avg_win}</strong>
                </p>
                <p>
                  <span>Avg Loss</span>
                  <strong className="negative">{tradeStats.avg_loss}</strong>
                </p>
                <p>
                  <span>Profit Factor</span>
                  <strong>{tradeStats.profit_factor}</strong>
                </p>
              </div>
            </article>
          </section>

          <section className="monthly-card">
            <h2>Monthly Returns</h2>

            {monthlyReturns.length > 0 ? (
              <div className="month-row">
                {monthlyReturns.map((value, index) => (
                  <span
                    key={`${value}-${index}`}
                    className={
                      String(value).startsWith("+")
                        ? "month-positive"
                        : "month-negative"
                    }
                  >
                    {value}%
                  </span>
                ))}
              </div>
            ) : (
              <p className="backtest-warning">
                No monthly return data yet. Run backtest to generate results.
              </p>
            )}
          </section>

          <section className="bottom-grid">
            <article>
              <h2>Return Distribution</h2>

              <div className="bar-chart">
                {returnDistribution.map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>

              <p>
                Average Return:{" "}
                <strong
                  className={
                    averageTradeReturn >= 0 ? "positive" : "negative"
                  }
                >
                  {averageTradeReturn >= 0 ? "+" : ""}
                  {averageTradeReturn.toFixed(2)}%
                </strong>
              </p>
            </article>

            <article>
              <h2>Drawdown</h2>

              <div className="drawdown-mini">
                <svg viewBox="0 0 260 150" preserveAspectRatio="none">
                  <path d={drawdownPath} className="dd-path" />
                </svg>
              </div>

              <p>
                Max Drawdown:{" "}
                <strong className="negative">
                  {Number(currentResult.mdd).toFixed(2)}%
                </strong>
              </p>
            </article>

            <article>
              <h2>Top 5 Winning Trades</h2>

              {topWinningTrades.length > 0 ? (
                <table>
                  <tbody>
                    {topWinningTrades.map((trade, index) => (
                      <tr key={`${trade.date}-${index}`}>
                        <td>{trade.date}</td>
                        <td>{trade.side}</td>
                        <td>{trade.return}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No winning trades.</p>
              )}
            </article>

            <article>
              <h2>Top 5 Losing Trades</h2>

              {topLosingTrades.length > 0 ? (
                <table>
                  <tbody>
                    {topLosingTrades.map((trade, index) => (
                      <tr key={`${trade.date}-${index}`}>
                        <td>{trade.date}</td>
                        <td>{trade.side}</td>
                        <td>{trade.return}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No losing trades.</p>
              )}
            </article>
          </section>

          <p className="backtest-warning">
            Backtest results are calculated from historical prediction CSV and
            do not guarantee future returns.
          </p>
        </section>
      </main>
    </div>
  );
}

export default BacktestPage;