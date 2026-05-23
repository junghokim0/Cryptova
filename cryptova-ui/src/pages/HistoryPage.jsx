import { useMemo, useState } from "react";
import "../styles/HistoryPage.css";
import logo from "../assets/logo.png";

function formatNow() {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function HistoryPage({ onGoHome, onGoTrading, onGoLogin, onGoBacktest }) {
  const currentTime = useMemo(() => formatNow(), []);

  const signals = useMemo(
    () => [
      {
        id: 1,
        type: "LONG",
        coin: "BTCUSDT",
        confidence: 87,
        entryPrice: "67,842.31",
        time: currentTime,
        status: "HOLDING",
        result: null,
        holdingStrategy: "24h Fixed",
        newsTone: "Positive",
        chartTone: "Bullish",
        riskLevel: "Medium",
      },
      {
        id: 2,
        type: "SHORT",
        coin: "BTCUSDT",
        confidence: 75,
        entryPrice: "63,712.45",
        time: currentTime,
        status: "CLOSED",
        result: "+2.15%",
        holdingStrategy: "24h Fixed",
        newsTone: "Negative",
        chartTone: "Bearish",
        riskLevel: "Low",
      },
      {
        id: 3,
        type: "LONG",
        coin: "BTCUSDT",
        confidence: 82,
        entryPrice: "64,123.88",
        time: currentTime,
        status: "CLOSED",
        result: "+3.42%",
        holdingStrategy: "24h Fixed",
        newsTone: "Positive",
        chartTone: "Bullish",
        riskLevel: "Medium",
      },
      {
        id: 4,
        type: "SHORT",
        coin: "BTCUSDT",
        confidence: 78,
        entryPrice: "66,891.22",
        time: currentTime,
        status: "STOPPED",
        result: "-1.82%",
        holdingStrategy: "24h Fixed",
        newsTone: "Mixed",
        chartTone: "Weak Bearish",
        riskLevel: "High",
      },
      {
        id: 5,
        type: "LONG",
        coin: "BTCUSDT",
        confidence: 80,
        entryPrice: "66,002.11",
        time: currentTime,
        status: "CLOSED",
        result: "+4.08%",
        holdingStrategy: "24h Fixed",
        newsTone: "Positive",
        chartTone: "Trend Follow",
        riskLevel: "Low",
      },
      {
        id: 6,
        type: "SHORT",
        coin: "BTCUSDT",
        confidence: 73,
        entryPrice: "67,233.19",
        time: currentTime,
        status: "CLOSED",
        result: "+2.31%",
        holdingStrategy: "24h Fixed",
        newsTone: "Negative",
        chartTone: "Reversal",
        riskLevel: "Medium",
      },
    ],
    [currentTime]
  );

  const [selectedId, setSelectedId] = useState(signals[0].id);
  const selectedSignal = signals.find((signal) => signal.id === selectedId);

  return (
    <div className="history-page">
      <div className="history-bg-grid" />
      <div className="history-glow history-glow-left" />
      <div className="history-glow history-glow-right" />

      <header className="history-navbar">
        <button type="button" className="history-logo-button" onClick={onGoHome}>
          <img src={logo} alt="Cryptova Logo" className="history-logo" />
        </button>

        <nav className="history-nav-menu">
          <button className="history-nav-link" onClick={onGoTrading}>
            Trading
          </button>
          <button className="history-nav-link active">History</button>
          <button className="trading-nav-link" onClick={onGoBacktest}>
            Backtest
          </button>
        </nav>

        <button type="button" className="history-login-button" onClick={onGoLogin}>
          <span>♙</span>
          Login / Sign Up
        </button>
      </header>

      <main className="history-layout">
        <section className="signal-history-panel">
          <div className="panel-title-row">
            <div className="title-left">
              <div className="history-title-icon refresh-icon" />
              <h2>AI Signal History</h2>
            </div>

            <select className="coin-filter" value="all" onChange={() => {}}>
              <option value="all">All Coins</option>
            </select>
          </div>

          <div className="signal-list">
            {signals.map((signal) => (
              <button
                key={signal.id}
                type="button"
                className={
                  selectedId === signal.id
                    ? "history-signal-card selected"
                    : "history-signal-card"
                }
                onClick={() => setSelectedId(signal.id)}
              >
                <div className="signal-card-top">
                  <div className="coin-left">
                    <span className={`signal-badge ${signal.type.toLowerCase()}`}>
                      {signal.type}
                    </span>
                    <span className="coin-icon">₿</span>
                    <strong>{signal.coin}</strong>
                  </div>

                  <div className="signal-confidence">
                    <span>Confidence</span>
                    <strong className={signal.type.toLowerCase()}>
                      {signal.confidence}%
                    </strong>
                  </div>

                  <span className={`status-pill ${signal.status.toLowerCase()}`}>
                    {signal.status}
                  </span>
                </div>

                <div className="signal-card-bottom">
                  <span>{signal.time}</span>

                  <div>
                    <p>Entry Price</p>
                    <strong>{signal.entryPrice}</strong>
                  </div>

                  {signal.result && (
                    <div>
                      <p>Result</p>
                      <strong
                        className={
                          signal.result.startsWith("+")
                            ? "result-positive"
                            : "result-negative"
                        }
                      >
                        {signal.result}
                      </strong>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="pagination">
            <button>‹</button>
            <button className="active">1</button>
            <button>2</button>
            <button>3</button>
            <span>...</span>
            <button>12</button>
            <button>›</button>
          </div>
        </section>

        <section className="trade-explanation-panel">
          <div className="explanation-main-title">
            <div className="explanation-title-left">
              <div className="brain-line-icon">
                <span />
                <span />
                <span />
              </div>
              <h2>AI Trade Explanation</h2>
            </div>

            <p className="updated-time">⟳ Last updated: {currentTime}</p>
          </div>

          <section className="selected-summary">
            <div className={`summary-arrow ${selectedSignal.type.toLowerCase()}`}>
              {selectedSignal.type === "LONG" ? "↑" : "↓"}
            </div>

            <div className="summary-main">
              <p>Selected Signal</p>
              <h3>
                <span className={selectedSignal.type.toLowerCase()}>
                  {selectedSignal.type}
                </span>{" "}
                {selectedSignal.coin}
              </h3>
            </div>

            <div className="summary-stat">
              <p>Confidence</p>
              <strong>{selectedSignal.confidence}%</strong>
            </div>

            <div className="summary-stat">
              <p>Entry Price</p>
              <strong>{selectedSignal.entryPrice}</strong>
            </div>

            <div className="summary-stat">
              <p>Signal Time</p>
              <strong>{selectedSignal.time}</strong>
            </div>

            <div className="summary-stat">
              <p>Holding Strategy</p>
              <strong className="strategy-pill">{selectedSignal.holdingStrategy}</strong>
            </div>
          </section>

          <div className="explanation-grid">
            <section className="analysis-column">
              <article className="analysis-card green-card">
                <div className="analysis-title">
                  <div className="mini-icon news-icon" />
                  <h3>
                    News Analysis
                  </h3>
                  <b>Positive Impact</b>
                </div>

                <ul>
                  <li>Recent market news shows increased positive sentiment.</li>
                  <li>Institutional interest and ETF-related keywords are rising.</li>
                  <li>Temporary placeholder explanation for future AI API output.</li>
                  <li>News tone: {selectedSignal.newsTone}</li>
                </ul>
              </article>

              <article className="analysis-card blue-card">
                <div className="analysis-title">
                  <div className="mini-icon chart-icon-small" />
                  <h3>
                    Chart Analysis
                  </h3>
                  <b>Bullish Signal</b>
                </div>

                <ul>
                  <li>Short-term trend structure is currently favorable.</li>
                  <li>Price action remains above key moving average zones.</li>
                  <li>Volatility regime is detected as {selectedSignal.riskLevel}.</li>
                  <li>Chart tone: {selectedSignal.chartTone}</li>
                </ul>
              </article>

              <article className="analysis-card purple-card">
                <div className="analysis-title">
                  <div className="mini-icon filter-icon" />
                  <h3>
                    Market Filters
                  </h3>
                  <b>Filter Passed</b>
                </div>

                <ul className="check-list">
                  <li>Funding rate condition checked</li>
                  <li>Volatility regime detected</li>
                  <li>Confidence threshold condition passed</li>
                  <li>Holding strategy: {selectedSignal.holdingStrategy}</li>
                </ul>
              </article>

              <article className="analysis-card yellow-card">
                <div className="analysis-title">
                  <div className="mini-icon decision-icon" />
                  <h3>AI Decision</h3>
                </div>

                <p>
                  This is a temporary explanation. Later, this section will be
                  replaced by an AI-generated explanation using the selected
                  signal, model prediction, market data, news sentiment, funding
                  rate, volatility, and post-trade risk filters.
                </p>

                <p>
                  Current decision:{" "}
                  <strong className={selectedSignal.type.toLowerCase()}>
                    {selectedSignal.type} signal
                  </strong>{" "}
                  with {selectedSignal.confidence}% confidence.
                </p>
              </article>
            </section>

            <aside className="fact-column">
              <section className="key-facts-card">
                <h3>▣ Key Facts</h3>

                <div className="fact-row">
                  <span>Current Price</span>
                  <strong>{selectedSignal.entryPrice} USDT</strong>
                </div>
                <div className="fact-row">
                  <span>24h Change</span>
                  <strong className="positive">+2.35%</strong>
                </div>
                <div className="fact-row">
                  <span>Volatility (24h)</span>
                  <strong>2.18%</strong>
                </div>
                <div className="fact-row">
                  <span>Funding Rate</span>
                  <strong>+0.012%</strong>
                </div>
                <div className="fact-row">
                  <span>Open Interest (24h)</span>
                  <strong>+8.21%</strong>
                </div>
                <div className="fact-row">
                  <span>Long/Short Ratio</span>
                  <strong>1.38</strong>
                </div>
                <div className="fact-row">
                  <span>Market Regime</span>
                  <strong>{selectedSignal.riskLevel}</strong>
                </div>
                <div className="fact-row">
                  <span>AI Model</span>
                  <strong>v2.1 Hybrid</strong>
                </div>
              </section>

              <section className="risk-note-card">
                <h3>⚠ Risk Note</h3>
                <p>
                  Markets are volatile and AI predictions are not guaranteed.
                  Always manage your risk before entering a trade.
                </p>
              </section>

              <section className="info-card">
                <h3>ⓘ Explanation</h3>
                <p>
                  This signal explanation is currently shown with placeholder
                  data. Later, it can be generated through an AI explanation API.
                </p>

                <p>
                  Model inputs may include news sentiment, chart indicators,
                  funding rate, open interest, volatility, and post-trade filters.
                </p>
              </section>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

export default HistoryPage;