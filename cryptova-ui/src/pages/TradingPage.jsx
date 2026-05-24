import { useEffect, useState } from "react";
import "../styles/TradingPage.css";
import logo from "../assets/logo.png";
import {
  getStrategySettings,
  saveStrategySettings,
} from "../api/strategyApi";
import { generateSignal, getSignals } from "../api/signalApi";

function TradingPage({
  user,
  onGoHome,
  onGoLogin,
  onGoHistory,
  onGoBacktest,
  onLogout,
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [confidenceThreshold, setConfidenceThreshold] = useState(65);
  const [positionSize, setPositionSize] = useState(5);
  const [leverage, setLeverage] = useState(10);
  const [maxDrawdownStop, setMaxDrawdownStop] = useState(-10);

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isStartingTrading, setIsStartingTrading] = useState(false);
  const [tradingMessage, setTradingMessage] = useState("");
  const [tradingError, setTradingError] = useState("");
  const [latestSignal, setLatestSignal] = useState(null);

  const recentSignals = [
    {
      type: "LONG",
      pair: "BTCUSDT",
      confidence: "87%",
      time: "1 min ago",
      price: "67,842.31",
      direction: "up",
    },
    {
      type: "SHORT",
      pair: "ETHUSDT",
      confidence: "75%",
      time: "15 min ago",
      price: "3,712.45",
      direction: "down",
    },
    {
      type: "LONG",
      pair: "SOLUSDT",
      confidence: "82%",
      time: "1 hour ago",
      price: "164.23",
      direction: "up",
    },
    {
      type: "SHORT",
      pair: "AVAXUSDT",
      confidence: "78%",
      time: "2 hours ago",
      price: "25.68",
      direction: "down",
    },
    {
      type: "LONG",
      pair: "LINKUSDT",
      confidence: "80%",
      time: "3 hours ago",
      price: "18.94",
      direction: "up",
    },
  ];

  useEffect(() => {
  async function loadSettings() {
    if (!user) {
      return;
    }

    try {
      const data = await getStrategySettings();

      setConfidenceThreshold(Number(data.confidence_threshold));
      setPositionSize(Number(data.position_size));
      setLeverage(Number(data.leverage));
      setMaxDrawdownStop(Number(data.max_drawdown_stop));
    } catch (error) {
      setSettingsError(error.message || "Failed to load settings.");
          }
        }

        loadSettings();
      }, [user]);

      useEffect(() => {
        loadLatestSignal();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [user]);

 
  const handleSaveSettings = async () => {
    setSettingsMessage("");
    setSettingsError("");

    if (!user) {
      setSettingsError("Please login before saving settings.");
      return;
    }

    try {
      setIsSavingSettings(true);

      await saveStrategySettings({
        exchange: "Bybit",
        symbol: "BTCUSDT",
        confidence_threshold: confidenceThreshold,
        holding_strategy: "24h Fixed",
        position_size: positionSize,
        leverage,
        max_drawdown_stop: maxDrawdownStop,
        funding_threshold: 0.0001,
        volatility_threshold: 0.015,
      });

      const updatedSettings = await getStrategySettings();

      setConfidenceThreshold(Number(updatedSettings.confidence_threshold));
      setPositionSize(Number(updatedSettings.position_size));
      setLeverage(Number(updatedSettings.leverage));
      setMaxDrawdownStop(Number(updatedSettings.max_drawdown_stop));

      setSettingsMessage("Settings saved successfully.");
    } catch (error) {
      setSettingsError(error.message || "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const loadLatestSignal = async () => {
    if (!user) return;

    try {
      const data = await getSignals();

      if (data.length > 0) {
        setLatestSignal(data[0]);
      }
    } catch (error) {
      console.error("Failed to load latest signal:", error);
    }
  };

  const handleStartAutoTrading = async () => {
  setTradingMessage("");
  setTradingError("");

  if (!user) {
    setTradingError("Please login before starting auto trading.");
    return;
  }

  try {
    setIsStartingTrading(true);

    const signal = await generateSignal();

    setLatestSignal(signal);

      setTradingMessage(
        `AI Signal generated: ${signal.signal} / Confidence ${signal.confidence}%`
      );
    } catch (error) {
      setTradingError(error.message || "Failed to start auto trading.");
    } finally {
      setIsStartingTrading(false);
    }
  };
  return (
    <div className="trading-page">
      <div className="trading-bg-grid" />
      <div className="trading-glow trading-glow-left" />
      <div className="trading-glow trading-glow-right" />

      <header className="trading-navbar">
        <button type="button" className="trading-logo-button" onClick={onGoHome}>
          <img src={logo} alt="Cryptova Logo" className="trading-logo" />
        </button>

        <nav className="trading-nav-menu">
          <button className="trading-nav-link active">Trading</button>

          <button className="trading-nav-link" onClick={onGoHistory}>
            History
          </button>

          <button className="trading-nav-link" onClick={onGoBacktest}>
            Backtest
          </button>
        </nav>

        {user ? (
          <button type="button" className="trading-login-button" onClick={onLogout}>
            <span>♙</span>
            Logout
          </button>
        ) : (
          <button type="button" className="trading-login-button" onClick={onGoLogin}>
            <span>♙</span>
            Login / Sign Up
          </button>
        )}
      </header>

      <main
        className={
          isSidebarOpen
            ? "trading-layout sidebar-open"
            : "trading-layout sidebar-closed"
        }
      >
        <aside className="settings-sidebar">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
          >
            {isSidebarOpen ? "‹" : "›"}
          </button>

          {isSidebarOpen && (
            <>
              <section className="exchange-card">
                <label className="select-row">
                  <div className="select-icon">⌂</div>

                  <div className="select-content">
                    <p>Exchange</p>
                    <select value="Bybit" onChange={() => {}}>
                      <option value="Bybit">Bybit</option>
                    </select>
                  </div>
                </label>

                <div className="select-divider" />

                <label className="select-row">
                  <div className="select-icon">◉</div>

                  <div className="select-content">
                    <p>Coin</p>
                    <select value="BTCUSDT" onChange={() => {}}>
                      <option value="BTCUSDT">BTCUSDT</option>
                    </select>
                  </div>
                </label>
              </section>

              <section className="setting-card">
                <h3>STRATEGY</h3>

                <div className="setting-block">
                  <div className="setting-label">
                    <span>Confidence Threshold</span>
                    <button type="button">?</button>
                  </div>

                  <div className="range-control">
                    <input
                      type="range"
                      min="50"
                      max="90"
                      step="1"
                      value={confidenceThreshold}
                      onChange={(e) =>
                        setConfidenceThreshold(Number(e.target.value))
                      }
                      style={{
                        "--value": `${
                          ((confidenceThreshold - 50) / (90 - 50)) * 100
                        }%`,
                      }}
                    />

                    <div className="range-meta">
                      <span>50%</span>
                      <strong>{confidenceThreshold}%</strong>
                      <span>90%</span>
                    </div>
                  </div>
                </div>

                <div className="setting-block holding-block">
                  <div className="setting-label">
                    <span>Holding Strategy</span>
                    <button type="button">?</button>
                  </div>

                  <label className="radio-row single">
                    <input type="radio" checked readOnly name="holding" />
                    <span>24h Fixed</span>
                  </label>
                </div>
              </section>

              <section className="setting-card">
                <h3>RISK CONTROL</h3>

                <div className="setting-block">
                  <div className="setting-label">
                    <span>Position Size</span>
                    <button type="button">?</button>
                  </div>

                  <div className="range-control">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={positionSize}
                      onChange={(e) => setPositionSize(Number(e.target.value))}
                      style={{
                        "--value": `${positionSize}%`,
                      }}
                    />

                    <div className="range-meta">
                      <span>0%</span>
                      <strong>{positionSize}%</strong>
                      <span>100%</span>
                    </div>
                  </div>
                </div>

                <div className="setting-block">
                  <div className="setting-label">
                    <span>Leverage</span>
                    <button type="button">?</button>
                  </div>

                  <div className="range-control">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={leverage}
                      onChange={(e) => setLeverage(Number(e.target.value))}
                      style={{
                        "--value": `${((leverage - 1) / (100 - 1)) * 100}%`,
                      }}
                    />

                    <div className="range-meta">
                      <span>1x</span>
                      <strong>{leverage}x</strong>
                      <span>100x</span>
                    </div>
                  </div>
                </div>

                <div className="setting-block">
                  <div className="setting-label">
                    <span>Max Drawdown Stop</span>
                    <button type="button">?</button>
                  </div>

                  <div className="range-control">
                    <input
                      type="range"
                      min="-30"
                      max="-5"
                      step="1"
                      value={maxDrawdownStop}
                      onChange={(e) =>
                        setMaxDrawdownStop(Number(e.target.value))
                      }
                      style={{
                        "--value": `${
                          ((maxDrawdownStop - -30) / (-5 - -30)) * 100
                        }%`,
                      }}
                    />

                    <div className="range-meta">
                      <span>-30%</span>
                      <strong>{maxDrawdownStop}%</strong>
                      <span>-5%</span>
                    </div>
                  </div>
                </div>

                <button type="button" className="recommended-button">
                  Use Recommended Settings
                </button>

                <button
                  type="button"
                  className="save-settings-button"
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                >
                  {isSavingSettings ? "Saving..." : "Save Settings"}
                </button>

                {settingsMessage && (
                  <p className="settings-success-message">{settingsMessage}</p>
                )}

                {settingsError && (
                  <p className="settings-error-message">{settingsError}</p>
                )}

                <button
                  type="button"
                  className="start-trading-button"
                  onClick={handleStartAutoTrading}
                  disabled={isStartingTrading}
                >
                  {isStartingTrading ? "Starting..." : "Start Auto Trading"} <span>↗</span>
                </button>
                                  {tradingMessage && (
                    <p className="settings-success-message">{tradingMessage}</p>
                  )}

                  {tradingError && (
                    <p className="settings-error-message">{tradingError}</p>
                  )}
              </section>
            </>
          )}
        </aside>

        <section className="trading-chart-card">
          <div className="chart-card-header">
            <div>
              <p className="chart-pair">
                BTCUSDT <span>⌄</span>
              </p>
              <h1>
                67,842.31 <span>+2.35%</span>
              </h1>
            </div>

            <div className="chart-metrics">
              <div>
                <p>Total Balance</p>
                <strong>$128,742.59</strong>
              </div>
              <div>
                <p>Daily PnL</p>
                <strong className="positive">+$5,382.21</strong>
                <span>+4.35%</span>
              </div>
              <div>
                <p>Total Return</p>
                <strong className="positive">+$28,742.59</strong>
                <span>+28.66%</span>
              </div>
            </div>
          </div>

          <div className="time-filter">
            <button>1H</button>
            <button>4H</button>
            <button className="selected">1D</button>
            <button>1W</button>
            <button>1M</button>
          </div>

          <div className="main-chart-area">
            <svg viewBox="0 0 980 520" preserveAspectRatio="none">
              <g className="chart-grid">
                <line x1="0" y1="80" x2="980" y2="80" />
                <line x1="0" y1="150" x2="980" y2="150" />
                <line x1="0" y1="220" x2="980" y2="220" />
                <line x1="0" y1="290" x2="980" y2="290" />
                <line x1="0" y1="360" x2="980" y2="360" />
                <line x1="0" y1="430" x2="980" y2="430" />

                <line x1="140" y1="20" x2="140" y2="480" />
                <line x1="300" y1="20" x2="300" y2="480" />
                <line x1="460" y1="20" x2="460" y2="480" />
                <line x1="620" y1="20" x2="620" y2="480" />
                <line x1="780" y1="20" x2="780" y2="480" />
              </g>

              <g className="fake-volume">
                {Array.from({ length: 58 }).map((_, index) => {
                  const height = 18 + ((index * 17) % 54);
                  const x = 20 + index * 15;

                  return (
                    <rect
                      key={index}
                      x={x}
                      y={470 - height}
                      width="8"
                      height={height}
                      rx="2"
                    />
                  );
                })}
              </g>

              {[
                [32, 245, 100, "down"],
                [62, 330, 90, "down"],
                [92, 280, 80, "up"],
                [122, 230, 130, "up"],
                [152, 170, 170, "up"],
                [182, 125, 155, "down"],
                [212, 155, 120, "down"],
                [242, 190, 110, "down"],
                [272, 230, 100, "down"],
                [302, 270, 120, "up"],
                [332, 200, 105, "up"],
                [362, 220, 90, "down"],
                [392, 230, 100, "up"],
                [422, 245, 105, "down"],
                [452, 270, 90, "down"],
                [482, 305, 110, "down"],
                [512, 335, 105, "down"],
                [542, 320, 80, "up"],
                [572, 300, 85, "up"],
                [602, 318, 75, "down"],
                [632, 332, 72, "down"],
                [662, 305, 85, "up"],
                [692, 280, 80, "up"],
                [722, 260, 90, "down"],
                [752, 215, 150, "up"],
                [782, 250, 105, "down"],
                [812, 270, 82, "down"],
                [842, 285, 75, "down"],
                [872, 300, 70, "up"],
              ].map(([x, y, h, type], index) => (
                <g key={index} className={`main-candle ${type}`}>
                  <line x1={x} y1={y - h / 2} x2={x} y2={y + h / 2} />
                  <rect
                    x={x - 7}
                    y={y - h / 4}
                    width="14"
                    height={h / 2}
                    rx="2"
                  />
                </g>
              ))}

              <g className="strategy-lines">
                <line x1="0" y1="120" x2="900" y2="120" className="line-red" />
                <line
                  x1="0"
                  y1="185"
                  x2="900"
                  y2="185"
                  className="line-orange"
                />
                <line
                  x1="0"
                  y1="255"
                  x2="900"
                  y2="255"
                  className="line-green"
                />
                <line x1="0" y1="315" x2="900" y2="315" className="line-blue" />
                <line
                  x1="0"
                  y1="375"
                  x2="900"
                  y2="375"
                  className="line-darkblue"
                />
              </g>
            </svg>

            <div className="chart-tag red-tag">
              Max. Drawdown Stop <b>{maxDrawdownStop}%</b>
            </div>
            <div className="chart-tag orange-tag">
              Max. Position Size <b>{positionSize}%</b>
            </div>
            <div className="chart-tag green-tag">Take Profit 2</div>
            <div className="chart-tag blue-tag">Take Profit 1</div>
            <div className="chart-tag navy-tag">Entry Price</div>

            <div className="price-axis">
              <span>6,300</span>
              <span>6,200</span>
              <span>6,100</span>
              <span>5,900</span>
              <span>5,800</span>
              <span>5,700</span>
              <span>5,600</span>
              <span>5,500</span>
              <span>5,400</span>
              <span>5,300</span>
              <span>5,200</span>
              <span>5,100</span>
            </div>

            <div className="date-axis">
              <span>May 1</span>
              <span>May 8</span>
              <span>May 15</span>
              <span>May 22</span>
              <span>May 29</span>
            </div>
          </div>
        </section>

        <aside className="trading-signal-panel">
          <section className="ai-signal-box">
            <h2>AI Signal</h2>

              <div
                  className={`trading-gauge ${
                    latestSignal?.signal === "LONG"
                      ? "gauge-long"
                      : latestSignal?.signal === "SHORT"
                      ? "gauge-short"
                      : "gauge-hold"
                  }`}
                >
              <div className="trading-gauge-inner">
                <strong
                  className={
                    latestSignal?.signal === "LONG"
                      ? "signal-long"
                      : latestSignal?.signal === "SHORT"
                      ? "signal-short"
                      : "signal-hold"
                  }
                >
                  {latestSignal ? latestSignal.signal : "NO SIGNAL"}
                </strong>
                <span>Confidence</span>
                <b>{latestSignal ? `${latestSignal.confidence}%` : "--"}</b>
              </div>
            </div>

            <div className="recent-signal-list">
              <h3>Recent Signals</h3>

              {recentSignals.map((signal) => (
                <div
                  className="recent-signal-item"
                  key={`${signal.pair}-${signal.time}`}
                >
                  <span className={`signal-dot ${signal.direction}`}>
                    {signal.direction === "up" ? "↑" : "↓"}
                  </span>

                  <div>
                    <strong className={signal.type === "LONG" ? "long" : "short"}>
                      {signal.type}
                    </strong>
                    <p>{signal.pair}</p>
                    <small>{signal.confidence}</small>
                  </div>

                  <div className="signal-right">
                    <span>{signal.time}</span>
                    <b>{signal.price}</b>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="explanation-box">
            <div className="explanation-title">
              <div className="explanation-icon chat-icon">
                <span />
              </div>

              <h3>AI Trade Explanation</h3>
            </div>

            <p>
              AI analyzes each Long/Short position entry reason and explains the
              current market context.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default TradingPage;