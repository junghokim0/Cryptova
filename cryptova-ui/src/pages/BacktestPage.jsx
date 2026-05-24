import { getExchangeBalance } from "../api/exchangeApi";
import { useEffect, useMemo, useState } from "react";
import "../styles/BacktestPage.css";
import logo from "../assets/logo.png";
import { getBacktestResults, runBacktest } from "../api/backtestApi";

const initialSettings = {
  confidence: 65,
  holdingPeriod: 24,
  positionSize: 5,
  maxDrawdown: -10,
};

const defaultResult = {
  total_return: 28.63,
  cagr: 23.41,
  sharpe: 1.82,
  mdd: -8.21,
  win_rate: 62.14,
  trade_count: 124,
  start_date: "2024-01-01",
  end_date: "2025-05-20",
  created_at: "2025-05-20T15:30:21",
  result_json: {
    monthly_returns: [
      "+3.21",
      "-1.84",
      "+4.57",
      "+2.31",
      "+6.72",
      "-2.11",
      "+3.88",
      "+1.25",
      "-3.45",
      "+5.19",
      "+2.73",
      "+7.02",
      "+4.23",
      "-1.73",
      "+2.96",
      "+3.83",
      "+2.44",
    ],
    trade_stats: {
      long_count: 78,
      short_count: 28,
      hold_count: 18,
      long_win_rate: 67.95,
      short_win_rate: 57.14,
      avg_holding_time: "18.6h",
      avg_win: "+2.31%",
      avg_loss: "-1.78%",
      profit_factor: 1.94,
    },
    top_winning_trades: [
      { date: "2024-12-11", side: "LONG", return: "+4.86%" },
      { date: "2024-10-28", side: "LONG", return: "+4.21%" },
      { date: "2025-01-15", side: "LONG", return: "+3.96%" },
      { date: "2024-03-05", side: "LONG", return: "+3.77%" },
      { date: "2024-07-22", side: "SHORT", return: "+3.45%" },
    ],
    top_losing_trades: [
      { date: "2024-08-07", side: "LONG", return: "-3.45%" },
      { date: "2024-06-18", side: "LONG", return: "-3.21%" },
      { date: "2024-09-03", side: "SHORT", return: "-2.98%" },
      { date: "2025-02-12", side: "LONG", return: "-2.72%" },
      { date: "2024-11-14", side: "SHORT", return: "-2.45%" },
    ],
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

function BacktestPage({
  user,
  onGoHome,
  onGoTrading,
  onGoHistory,
  onGoLogin,
  onLogout,
}) {
  const [assetBalance, setAssetBalance] = useState(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState("");
  const [settings, setSettings] = useState(initialSettings);
  const [isAssetOpen, setIsAssetOpen] = useState(true);

  const [currentResult, setCurrentResult] = useState(defaultResult);
  const [isRunning, setIsRunning] = useState(false);
  const [backtestMessage, setBacktestMessage] = useState("");
  const [backtestError, setBacktestError] = useState("");

  const resultJson = currentResult?.result_json || {};

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

  useEffect(() => {
    async function loadLatestBacktest() {
      if (!user) return;

      try {
        const results = await getBacktestResults();

        if (results.length > 0) {
          setCurrentResult(results[0]);
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
        start_date: "2024-01-01",
        end_date: "2025-05-20",
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

  const loadExchangeBalance = async () => {
  if (!user) {
    setAssetError("Please login to load asset data.");
    return;
  }

  try {
    setAssetLoading(true);
    setAssetError("");

    const data = await getExchangeBalance();
    setAssetBalance(data);
  } catch (error) {
    setAssetError(error.message || "Failed to load asset data.");
  } finally {
    setAssetLoading(false);
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

        <button
          type="button"
          className="asset-button"
          onClick={() => {
            setIsAssetOpen((prev) => !prev);
            loadExchangeBalance();
          }}
        >
          <span className="asset-icon">▣</span>
          <div>
            <p>Total Asset</p>
            <strong>$10,000.00</strong>
          </div>
          <span className={isAssetOpen ? "asset-arrow open" : "asset-arrow"}>
            ⌃
          </span>
        </button>

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

      <main
        className={
          isAssetOpen
            ? "backtest-layout asset-open"
            : "backtest-layout asset-closed"
        }
      >
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
                min="50"
                max="90"
                step="1"
                value={settings.confidence}
                onChange={(e) =>
                  updateSetting("confidence", Number(e.target.value))
                }
                style={{
                  "--value": `${((settings.confidence - 50) / 40) * 100}%`,
                }}
              />
              <div className="range-scale">
                <span>50%</span>
                <span>65%</span>
                <span>90%</span>
              </div>
              <p>Minimum confidence level for signal activation.</p>
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

          <p className="data-period">Data period: 2024-01-01 ~ 2025-05-20</p>
        </aside>

        <section className="backtest-dashboard">
          <div className="dashboard-title-row">
            <div>
              <h1>Backtest Result Summary</h1>
              <span>
                {currentResult.start_date} ~ {currentResult.end_date}{" "}
                (Non-overlap)
              </span>
            </div>
            <p>Last updated: {formatDateTime(currentResult.created_at)} ⟳</p>
          </div>

          <section className="summary-grid">
            <article>
              <p>Total Return</p>
              <strong className="positive">
                +{Number(currentResult.total_return).toFixed(2)}%
              </strong>
              <span>Cumulative Return</span>
            </article>
            <article>
              <p>CAGR</p>
              <strong className="positive">
                +{Number(currentResult.cagr).toFixed(2)}%
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
                  <button className="active">Full</button>
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
                    points="10,260 60,240 95,265 130,210 170,200 220,170 260,190 310,150 350,160 400,115 440,130 490,90 540,70 590,95 640,80 690,92 750,68 790,45"
                  />

                  <polyline
                    className="benchmark-line"
                    points="10,260 60,255 95,250 130,245 170,230 220,220 260,225 310,205 350,198 400,180 440,185 490,155 540,140 590,158 640,148 690,135 750,130 790,115"
                  />

                  <path
                    className="drawdown-area"
                    d="M80 265 L120 280 L160 250 L200 260 L250 250 L310 270 L360 285 L420 295 L500 300 L560 286 L620 280 L620 330 L80 330 Z"
                  />
                </svg>

                <div className="chart-months">
                  <span>2024-01</span>
                  <span>2024-03</span>
                  <span>2024-05</span>
                  <span>2024-07</span>
                  <span>2024-09</span>
                  <span>2024-11</span>
                  <span>2025-01</span>
                  <span>2025-03</span>
                  <span>2025-05</span>
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
                    <b className="green-dot" /> LONG 62.9% (
                    {tradeStats.long_count})
                  </li>
                  <li>
                    <b className="red-dot" /> SHORT 22.6% (
                    {tradeStats.short_count})
                  </li>
                  <li>
                    <b className="gray-dot" /> HOLD 14.5% (
                    {tradeStats.hold_count})
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
            <div className="month-row">
              {monthlyReturns.map((value, index) => (
                <span
                  key={index}
                  className={
                    value.startsWith("+") ? "month-positive" : "month-negative"
                  }
                >
                  {value}
                </span>
              ))}
            </div>
          </section>

          <section className="bottom-grid">
            <article>
              <h2>Return Distribution</h2>
              <div className="bar-chart">
                {[18, 35, 56, 100, 62, 42, 18].map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <p>
                Average Return: <strong className="positive">+0.48%</strong>
              </p>
            </article>

            <article>
              <h2>Drawdown</h2>
              <div className="drawdown-mini">
                <svg viewBox="0 0 260 150" preserveAspectRatio="none">
                  <path
                    d="M0 20 L20 35 L40 28 L60 60 L85 48 L105 90 L130 115 L160 70 L190 80 L220 45 L260 35 L260 150 L0 150 Z"
                    className="dd-path"
                  />
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
            </article>

            <article>
              <h2>Top 5 Losing Trades</h2>
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
            </article>
          </section>

          <p className="backtest-warning">
            Backtest results are based on historical data and do not guarantee
            future returns.
          </p>
        </section>

        <aside className={isAssetOpen ? "asset-panel open" : "asset-panel closed"}>
          <button
            className="asset-close-button"
            type="button"
            onClick={() => setIsAssetOpen(false)}
          >
            ×
          </button>

          <h2>Asset</h2>

          <section className="asset-summary-card">
          <h3>Total Asset Summary</h3>

          {assetLoading ? (
            <p>Loading asset data...</p>
          ) : assetError ? (
            <p className="asset-error">{assetError}</p>
          ) : assetBalance ? (
            <>
              <div className="asset-big-card">
                <p>Wallet Balance</p>
                <strong>
                  ${Number(assetBalance.wallet_balance).toLocaleString()}
                </strong>
                <div>
                  <span>Coin</span>
                  <b>{assetBalance.coin}</b>
                </div>
                <div>
                  <span>Testnet</span>
                  <b>{assetBalance.is_testnet ? "True" : "False"}</b>
                </div>
              </div>

              <div className="asset-list">
                <p>
                  <span>Available Balance</span>
                  <strong>
                    ${Number(assetBalance.available_balance).toLocaleString()}
                  </strong>
                </p>
                <p>
                  <span>Used Margin</span>
                  <strong>
                    ${Number(assetBalance.used_margin).toLocaleString()}
                  </strong>
                </p>
                <p>
                  <span>Unrealized PnL</span>
                  <strong
                    className={
                      Number(assetBalance.unrealized_pnl) >= 0
                        ? "positive"
                        : "negative"
                    }
                  >
                    ${Number(assetBalance.unrealized_pnl).toLocaleString()}
                  </strong>
                </p>
                <p>
                  <span>Exchange</span>
                  <strong>{assetBalance.exchange}</strong>
                </p>
              </div>
            </>
          ) : (
            <p>Click Total Asset to load balance.</p>
          )}
        </section>

          <section className="asset-composition-card">
            <h3>Asset Composition</h3>
            <div className="asset-donut">
              <div>
                <span>Total</span>
                <strong>$10,000</strong>
              </div>
            </div>

            <div className="asset-composition-list">
              <p>
                <b className="green-dot" /> Cash <span>63.2%</span>
              </p>
              <p>
                <b className="blue-dot" /> Positions <span>33.5%</span>
              </p>
              <p>
                <b className="gray-dot" /> Others <span>3.3%</span>
              </p>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default BacktestPage;