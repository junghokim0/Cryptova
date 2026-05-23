import { useState } from "react";
import "../styles/BacktestPage.css";
import logo from "../assets/logo.png";

const initialSettings = {
  confidence: 65,
  holdingPeriod: 24,
  positionSize: 5,
  maxDrawdown: -10,
  fundingThreshold: 0.0001,
  volatilityThreshold: 0.015,
};

function BacktestPage({ onGoHome, onGoTrading, onGoHistory, onGoLogin }) {
  const [settings, setSettings] = useState(initialSettings);
  const [isAssetOpen, setIsAssetOpen] = useState(true);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetSettings = () => {
    setSettings(initialSettings);
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
          onClick={() => setIsAssetOpen((prev) => !prev)}
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

        <button type="button" className="profile-button" onClick={onGoLogin}>
          JD⌄
        </button>
      </header>

      <main className={isAssetOpen ? "backtest-layout asset-open" : "backtest-layout asset-closed"}>
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
                onChange={(e) => updateSetting("confidence", Number(e.target.value))}
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
                onChange={(e) => updateSetting("positionSize", Number(e.target.value))}
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
                onChange={(e) => updateSetting("maxDrawdown", Number(e.target.value))}
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
            <h3>2. Filter Settings</h3>

            <div className="bt-setting-block">
              <div className="bt-setting-label">
                <span>Funding Rate Threshold</span>
                <b>{settings.fundingThreshold.toFixed(4)}</b>
              </div>
              <input
                type="range"
                min="-0.0005"
                max="0.001"
                step="0.0001"
                value={settings.fundingThreshold}
                onChange={(e) =>
                  updateSetting("fundingThreshold", Number(e.target.value))
                }
                style={{
                  "--value": `${((settings.fundingThreshold + 0.0005) / 0.0015) * 100}%`,
                }}
              />
              <div className="range-scale">
                <span>-0.0005</span>
                <span>0</span>
                <span>0.001</span>
              </div>
            </div>

            <div className="bt-setting-block">
              <div className="bt-setting-label">
                <span>Volatility Threshold</span>
                <b>{settings.volatilityThreshold.toFixed(3)}</b>
              </div>
              <input
                type="range"
                min="0.005"
                max="0.03"
                step="0.001"
                value={settings.volatilityThreshold}
                onChange={(e) =>
                  updateSetting("volatilityThreshold", Number(e.target.value))
                }
                style={{
                  "--value": `${((settings.volatilityThreshold - 0.005) / 0.025) * 100}%`,
                }}
              />
              <div className="range-scale">
                <span>0.005</span>
                <span>0.015</span>
                <span>0.030</span>
              </div>
            </div>

            <div className="filter-rule-box">
              <h4>Filter Rule</h4>
              <p>
                LONG signals are converted to HOLD when funding is high and
                volatility is low.
              </p>
              <code>
                funding_rate &gt; threshold
                <br />
                AND std_24h &lt; volatility_threshold
              </code>
            </div>
          </section>

          <button type="button" className="run-backtest-button">
            Run Backtest ▶
          </button>

          <p className="data-period">Data period: 2024-01-01 ~ 2025-05-20</p>
        </aside>

        <section className="backtest-dashboard">
          <div className="dashboard-title-row">
            <div>
              <h1>Backtest Result Summary</h1>
              <span>2024-01-01 ~ 2025-05-20 (Non-overlap)</span>
            </div>
            <p>Last updated: 2025-05-20 15:30:21 ⟳</p>
          </div>

          <section className="summary-grid">
            <article>
              <p>Total Return</p>
              <strong className="positive">+28.63%</strong>
              <span>Cumulative Return</span>
            </article>
            <article>
              <p>CAGR</p>
              <strong className="positive">+23.41%</strong>
              <span>Annualized Return</span>
            </article>
            <article>
              <p>Sharpe Ratio</p>
              <strong>1.82</strong>
              <span>Risk-adjusted</span>
            </article>
            <article>
              <p>Max Drawdown</p>
              <strong className="negative">-8.21%</strong>
              <span>MDD</span>
            </article>
            <article>
              <p>Win Rate</p>
              <strong>62.14%</strong>
              <span>Winning Trades</span>
            </article>
            <article>
              <p>Trade Count</p>
              <strong>124</strong>
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
                    <strong>124</strong>
                  </div>
                </div>
                <ul>
                  <li><b className="green-dot" /> LONG 62.9% (78)</li>
                  <li><b className="red-dot" /> SHORT 22.6% (28)</li>
                  <li><b className="gray-dot" /> HOLD 14.5% (18)</li>
                </ul>
              </div>

              <div className="stats-list">
                <p><span>LONG Win Rate</span><strong className="positive">67.95%</strong></p>
                <p><span>SHORT Win Rate</span><strong className="positive">57.14%</strong></p>
                <p><span>Avg Holding Time</span><strong>18.6h</strong></p>
                <p><span>Avg Win</span><strong className="positive">+2.31%</strong></p>
                <p><span>Avg Loss</span><strong className="negative">-1.78%</strong></p>
                <p><span>Profit Factor</span><strong>1.94</strong></p>
              </div>
            </article>
          </section>

          <section className="monthly-card">
            <h2>Monthly Returns</h2>
            <div className="month-row">
              {[
                "+3.21", "-1.84", "+4.57", "+2.31", "+6.72",
                "-2.11", "+3.88", "+1.25", "-3.45", "+5.19",
                "+2.73", "+7.02", "+4.23", "-1.73", "+2.96",
                "+3.83", "+2.44",
              ].map((value, index) => (
                <span
                  key={index}
                  className={value.startsWith("+") ? "month-positive" : "month-negative"}
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
              <p>Average Return: <strong className="positive">+0.48%</strong></p>
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
              <p>Max Drawdown: <strong className="negative">-8.21%</strong></p>
            </article>

            <article>
              <h2>Top 5 Winning Trades</h2>
              <table>
                <tbody>
                  <tr><td>2024-12-11</td><td>LONG</td><td>+4.86%</td></tr>
                  <tr><td>2024-10-28</td><td>LONG</td><td>+4.21%</td></tr>
                  <tr><td>2025-01-15</td><td>LONG</td><td>+3.96%</td></tr>
                  <tr><td>2024-03-05</td><td>LONG</td><td>+3.77%</td></tr>
                  <tr><td>2024-07-22</td><td>SHORT</td><td>+3.45%</td></tr>
                </tbody>
              </table>
            </article>

            <article>
              <h2>Top 5 Losing Trades</h2>
              <table>
                <tbody>
                  <tr><td>2024-08-07</td><td>LONG</td><td>-3.45%</td></tr>
                  <tr><td>2024-06-18</td><td>LONG</td><td>-3.21%</td></tr>
                  <tr><td>2024-09-03</td><td>SHORT</td><td>-2.98%</td></tr>
                  <tr><td>2025-02-12</td><td>LONG</td><td>-2.72%</td></tr>
                  <tr><td>2024-11-14</td><td>SHORT</td><td>-2.45%</td></tr>
                </tbody>
              </table>
            </article>
          </section>

          <p className="backtest-warning">
            Backtest results are based on historical data and do not guarantee future returns.
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
            <div className="asset-big-card">
              <p>Total Asset</p>
              <strong>$10,000.00</strong>
              <div>
                <span>Daily PnL</span>
                <b>+$242.35</b>
              </div>
              <div>
                <span>Total Return</span>
                <b>+$2,863.00</b>
              </div>
            </div>

            <div className="asset-list">
              <p><span>Initial Capital</span><strong>$7,137.00</strong></p>
              <p><span>Withdrawable</span><strong>$6,324.50</strong></p>
              <p><span>Used Margin</span><strong>$1,675.50</strong></p>
              <p><span>Unrealized PnL</span><strong className="positive">+$863.00</strong></p>
            </div>
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
              <p><b className="green-dot" /> Cash <span>63.2%</span></p>
              <p><b className="blue-dot" /> Positions <span>33.5%</span></p>
              <p><b className="gray-dot" /> Others <span>3.3%</span></p>
            </div>
          </section>

        </aside>
      </main>
    </div>
  );
}

export default BacktestPage;