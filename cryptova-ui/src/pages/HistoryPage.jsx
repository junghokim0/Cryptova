import { useEffect, useMemo, useState } from "react";
import "../styles/HistoryPage.css";
import logo from "../assets/logo.png";
import { createMockSignal, getSignals } from "../api/signalApi";

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatPrice(value) {
  if (value === null || value === undefined) return "-";

  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function HistoryPage({
  user,
  onGoHome,
  onGoTrading,
  onGoBacktest,
  onGoLogin,
  onLogout,
}) {
  const [signals, setSignals] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const selectedSignal = useMemo(() => {
    if (signals.length === 0) return null;

    return signals.find((signal) => signal.id === selectedId) || signals[0];
  }, [signals, selectedId]);

  const loadSignals = async () => {
    if (!user) {
      setHistoryError("Please login to view signal history.");
      return;
    }

    try {
      setIsLoading(true);
      setHistoryError("");

      const data = await getSignals();

      setSignals(data);

      if (data.length > 0) {
        setSelectedId((prev) => prev || data[0].id);
      }
    } catch (error) {
      setHistoryError(error.message || "Failed to load signal history.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateMockSignal = async () => {
    if (!user) {
      setHistoryError("Please login before creating a signal.");
      return;
    }

    try {
      setHistoryError("");

      const created = await createMockSignal();

      await loadSignals();
      setSelectedId(created.id);
    } catch (error) {
      setHistoryError(error.message || "Failed to create mock signal.");
    }
  };

  useEffect(() => {
    loadSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
          <button className="history-nav-link" onClick={onGoBacktest}>
            Backtest
          </button>
        </nav>

        {user ? (
          <button type="button" className="history-login-button" onClick={onLogout}>
            <span>♙</span>
            Logout
          </button>
        ) : (
          <button type="button" className="history-login-button" onClick={onGoLogin}>
            <span>♙</span>
            Login / Sign Up
          </button>
        )}
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

          <button
            type="button"
            className="mock-signal-button"
            onClick={handleCreateMockSignal}
          >
            + Create Mock Signal
          </button>

          {historyError && <p className="history-error-message">{historyError}</p>}

          {isLoading && <p className="history-loading-message">Loading signals...</p>}

          <div className="signal-list">
            {!isLoading && signals.length === 0 && (
              <div className="empty-history-box">
                <h3>No signals yet</h3>
                <p>Create a mock signal first. Later, AI-generated signals will appear here.</p>
              </div>
            )}

            {signals.map((signal) => (
              <button
                key={signal.id}
                type="button"
                className={
                  selectedSignal?.id === signal.id
                    ? "history-signal-card selected"
                    : "history-signal-card"
                }
                onClick={() => setSelectedId(signal.id)}
              >
                <div className="signal-card-top">
                  <div className="coin-left">
                    <span className={`signal-badge ${signal.signal.toLowerCase()}`}>
                      {signal.signal}
                    </span>
                    <span className="coin-icon">₿</span>
                    <strong>{signal.symbol}</strong>
                  </div>

                  <div className="signal-confidence">
                    <span>Confidence</span>
                    <strong className={signal.signal.toLowerCase()}>
                      {Math.round(signal.confidence)}%
                    </strong>
                  </div>

                  <span className={`status-pill ${signal.status.toLowerCase()}`}>
                    {signal.status}
                  </span>
                </div>

                <div className="signal-card-bottom">
                  <span>{formatDateTime(signal.created_at)}</span>

                  <div>
                    <p>Entry Price</p>
                    <strong>{formatPrice(signal.entry_price)}</strong>
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

            <p className="updated-time">
              ⟳ Last updated:{" "}
              {selectedSignal ? formatDateTime(selectedSignal.created_at) : "-"}
            </p>
          </div>

          {!selectedSignal ? (
            <div className="empty-explanation-box">
              <h3>No signal selected</h3>
              <p>
                Create or select an AI signal to view explanation details.
              </p>
            </div>
          ) : (
            <>
              <section className="selected-summary">
                <div className={`summary-arrow ${selectedSignal.signal.toLowerCase()}`}>
                  {selectedSignal.signal === "SHORT" ? "↓" : "↑"}
                </div>

                <div className="summary-main">
                  <p>Selected Signal</p>
                  <h3>
                    <span className={selectedSignal.signal.toLowerCase()}>
                      {selectedSignal.signal}
                    </span>{" "}
                    {selectedSignal.symbol}
                  </h3>
                </div>

                <div className="summary-stat">
                  <p>Confidence</p>
                  <strong>{Math.round(selectedSignal.confidence)}%</strong>
                </div>

                <div className="summary-stat">
                  <p>Entry Price</p>
                  <strong>{formatPrice(selectedSignal.entry_price)}</strong>
                </div>

                <div className="summary-stat">
                  <p>Signal Time</p>
                  <strong>{formatDateTime(selectedSignal.created_at)}</strong>
                </div>

                <div className="summary-stat">
                  <p>Status</p>
                  <strong className="strategy-pill">{selectedSignal.status}</strong>
                </div>
              </section>

              <div className="explanation-grid">
                <section className="analysis-column">
                  <article className="analysis-card green-card">
                    <div className="analysis-title">
                      <div className="mini-icon news-icon" />
                      <h3>
                        <span>1</span> News Analysis
                      </h3>
                      <b>Market Context</b>
                    </div>

                    <ul>
                      <li>
                        {selectedSignal.news_summary ||
                          "Temporary news explanation will be replaced by AI API output."}
                      </li>
                      <li>
                        This section will later summarize real-time market news.
                      </li>
                      <li>
                        News sentiment and keyword context can be shown here.
                      </li>
                    </ul>
                  </article>

                  <article className="analysis-card blue-card">
                    <div className="analysis-title">
                      <div className="mini-icon chart-icon-small" />
                      <h3>
                        <span>2</span> Chart Analysis
                      </h3>
                      <b>Chart Signal</b>
                    </div>

                    <ul>
                      <li>
                        {selectedSignal.chart_summary ||
                          "Temporary chart explanation will be replaced by model output."}
                      </li>
                      <li>
                        Technical indicators and model confidence can be shown here.
                      </li>
                      <li>
                        Future integration can include trend, volatility, and momentum.
                      </li>
                    </ul>
                  </article>

                  <article className="analysis-card purple-card">
                    <div className="analysis-title">
                      <div className="mini-icon filter-icon" />
                      <h3>
                        <span>3</span> Market Filters
                      </h3>
                      <b>Risk Review</b>
                    </div>

                    <ul className="check-list">
                      <li>
                        {selectedSignal.filter_summary ||
                          "Default funding and volatility risk filter was reviewed."}
                      </li>
                      <li>Confidence threshold condition checked</li>
                      <li>Holding strategy: 24h Fixed</li>
                    </ul>
                  </article>

                  <article className="analysis-card yellow-card">
                    <div className="analysis-title">
                      <div className="mini-icon decision-icon" />
                      <h3>AI Decision</h3>
                    </div>

                    <p>
                      {selectedSignal.reason_summary ||
                        "This is a temporary AI decision explanation. Later, this text will be generated from the AI explanation API."}
                    </p>

                    <p>
                      Current decision:{" "}
                      <strong className={selectedSignal.signal.toLowerCase()}>
                        {selectedSignal.signal} signal
                      </strong>{" "}
                      with {Math.round(selectedSignal.confidence)}% confidence.
                    </p>
                  </article>
                </section>

                <aside className="fact-column">
                  <section className="key-facts-card">
                    <h3>▣ Key Facts</h3>

                    <div className="fact-row">
                      <span>Current Price</span>
                      <strong>{formatPrice(selectedSignal.entry_price)} USDT</strong>
                    </div>
                    <div className="fact-row">
                      <span>Signal</span>
                      <strong className={selectedSignal.signal.toLowerCase()}>
                        {selectedSignal.signal}
                      </strong>
                    </div>
                    <div className="fact-row">
                      <span>Confidence</span>
                      <strong>{Math.round(selectedSignal.confidence)}%</strong>
                    </div>
                    <div className="fact-row">
                      <span>Status</span>
                      <strong>{selectedSignal.status}</strong>
                    </div>
                    <div className="fact-row">
                      <span>Result</span>
                      <strong>{selectedSignal.result || "-"}</strong>
                    </div>
                    <div className="fact-row">
                      <span>AI Model</span>
                      <strong>Temporary Mock</strong>
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
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default HistoryPage;