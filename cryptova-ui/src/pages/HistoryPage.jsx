import AssetSummary from "../components/AssetSummary";
import { useEffect, useMemo, useState } from "react";
import "../styles/HistoryPage.css";
import logo from "../assets/logo.png";
import { getTradingRuns } from "../api/tradingApi";

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

function formatNumber(value, digits = 4) {
  if (value === null || value === undefined) return "-";

  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function getActionLabel(action) {
  if (action === "SKIPPED_SIGNAL") return "Signal Skipped";
  if (action === "PAPER_ORDER_OPENED") return "Paper Entry";
  if (action === "SKIPPED_HOLDING") return "Holding";
  if (action === "CLOSED_POSITION") return "Position Closed";
  if (action === "DRY_RUN_ORDER") return "Dry Run";
  if (action === "REAL_ORDER_SUBMITTED") return "Real Order";
  if (action === "ORDER_FAILED") return "Order Failed";

  return action || "-";
}

function getStatusClass(run) {
  if (!run) return "closed";

  if (run.action === "PAPER_ORDER_OPENED") return "holding";
  if (run.action === "SKIPPED_HOLDING") return "holding";
  if (run.action === "CLOSED_POSITION") return "closed";
  if (run.action === "ORDER_FAILED") return "stopped";

  return "closed";
}

function getSignalClass(signal) {
  if (signal === "LONG") return "long";
  if (signal === "SHORT") return "short";
  return "hold";
}

function getSignalArrow(signal) {
  if (signal === "SHORT") return "↓";
  if (signal === "LONG") return "↑";
  return "–";
}

function HistoryPage({
  user,
  onGoHome,
  onGoTrading,
  onGoBacktest,
  onGoLogin,
  onLogout,
}) {
  const [runs, setRuns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const selectedRun = useMemo(() => {
    if (runs.length === 0) return null;

    return runs.find((run) => run.id === selectedId) || runs[0];
  }, [runs, selectedId]);

  const loadTradingRuns = async () => {
    if (!user) {
      setHistoryError("Please login to view trading history.");
      return;
    }

    try {
      setIsLoading(true);
      setHistoryError("");

      const data = await getTradingRuns({ limit: 50 });

      setRuns(data);

      if (data.length > 0) {
        setSelectedId((prev) => prev || data[0].id);
      }
    } catch (error) {
      setHistoryError(error.message || "Failed to load trading history.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTradingRuns();
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

        <AssetSummary user={user} />

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
              <h2>Auto Trading History</h2>
            </div>

            <select className="coin-filter" value="BTCUSDT" onChange={() => {}}>
              <option value="BTCUSDT">BTCUSDT</option>
            </select>
          </div>

          <button
            type="button"
            className="mock-signal-button"
            onClick={loadTradingRuns}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Refresh Trading Runs"}
          </button>

          {historyError && <p className="history-error-message">{historyError}</p>}

          {isLoading && (
            <p className="history-loading-message">Loading trading runs...</p>
          )}

          <div className="signal-list">
            {!isLoading && runs.length === 0 && (
              <div className="empty-history-box">
                <h3>No trading runs yet</h3>
                <p>
                  Start auto trading or click Run Once on the Trading page.
                  Execution logs will appear here.
                </p>
              </div>
            )}

            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className={
                  selectedRun?.id === run.id
                    ? "history-signal-card selected"
                    : "history-signal-card"
                }
                onClick={() => setSelectedId(run.id)}
              >
                <div className="signal-card-top">
                  <div className="coin-left">
                    <span
                      className={`signal-badge ${getSignalClass(run.signal)}`}
                    >
                      {run.signal || "-"}
                    </span>
                    <span className="coin-icon">₿</span>
                    <strong>{run.symbol}</strong>
                  </div>

                  <div className="signal-confidence">
                    <span>Action</span>
                    <strong className={getSignalClass(run.signal)}>
                      {getActionLabel(run.action)}
                    </strong>
                  </div>

                  <span className={`status-pill ${getStatusClass(run)}`}>
                    {run.position_status || run.order_status || "LOG"}
                  </span>
                </div>

                <div className="signal-card-bottom">
                  <span>{formatDateTime(run.executed_at)}</span>

                  <div>
                    <p>Order Status</p>
                    <strong>{run.order_status || "-"}</strong>
                  </div>

                  <div>
                    <p>PnL</p>
                    <strong
                      className={
                        run.pnl > 0
                          ? "result-positive"
                          : run.pnl < 0
                          ? "result-negative"
                          : ""
                      }
                    >
                      {run.pnl !== null && run.pnl !== undefined
                        ? formatNumber(run.pnl, 4)
                        : "-"}
                    </strong>
                  </div>
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
              <h2>Trading Run Detail</h2>
            </div>

            <p className="updated-time">
              ⟳ Last updated:{" "}
              {selectedRun ? formatDateTime(selectedRun.executed_at) : "-"}
            </p>
          </div>

          {!selectedRun ? (
            <div className="empty-explanation-box">
              <h3>No run selected</h3>
              <p>
                Run auto trading once or start scheduler to view execution logs.
              </p>
            </div>
          ) : (
            <>
              <section className="selected-summary">
                <div className={`summary-arrow ${getSignalClass(selectedRun.signal)}`}>
                  {getSignalArrow(selectedRun.signal)}
                </div>

                <div className="summary-main">
                  <p>Selected Run</p>
                  <h3>
                    <span className={getSignalClass(selectedRun.signal)}>
                      {selectedRun.signal || "-"}
                    </span>{" "}
                    {selectedRun.symbol}
                  </h3>
                </div>

                <div className="summary-stat">
                  <p>Action</p>
                  <strong>{getActionLabel(selectedRun.action)}</strong>
                </div>

                <div className="summary-stat">
                  <p>Order</p>
                  <strong>{selectedRun.order_status || "-"}</strong>
                </div>

                <div className="summary-stat">
                  <p>Position</p>
                  <strong>{selectedRun.position_status || "-"}</strong>
                </div>

                <div className="summary-stat">
                  <p>Run Time</p>
                  <strong>{formatDateTime(selectedRun.executed_at)}</strong>
                </div>
              </section>

              <div className="explanation-grid">
                <section className="analysis-column">
                  <article className="analysis-card blue-card">
                    <div className="analysis-title">
                      <div className="mini-icon chart-icon-small" />
                      <h3>
                        <span>1</span> Execution Summary
                      </h3>
                      <b>{getActionLabel(selectedRun.action)}</b>
                    </div>

                    <p>{selectedRun.message || "No message recorded."}</p>

                    <p>
                      This log was generated by the automated trading cycle.
                      It records whether the system opened a paper position,
                      skipped a signal, held an existing position, or closed a
                      position.
                    </p>
                  </article>

                  <article className="analysis-card green-card">
                    <div className="analysis-title">
                      <div className="mini-icon news-icon" />
                      <h3>
                        <span>2</span> Signal / Order Info
                      </h3>
                      <b>Trading Flow</b>
                    </div>

                    <ul>
                      <li>Signal ID: {selectedRun.signal_id || "-"}</li>
                      <li>Signal: {selectedRun.signal || "-"}</li>
                      <li>Order ID: {selectedRun.order_id || "-"}</li>
                      <li>Order Status: {selectedRun.order_status || "-"}</li>
                    </ul>
                  </article>

                  <article className="analysis-card purple-card">
                    <div className="analysis-title">
                      <div className="mini-icon filter-icon" />
                      <h3>
                        <span>3</span> Position Result
                      </h3>
                      <b>Paper Engine</b>
                    </div>

                    <ul className="check-list">
                      <li>Position ID: {selectedRun.position_id || "-"}</li>
                      <li>
                        Position Status: {selectedRun.position_status || "-"}
                      </li>
                      <li>
                        PnL:{" "}
                        {selectedRun.pnl !== null &&
                        selectedRun.pnl !== undefined
                          ? formatNumber(selectedRun.pnl, 4)
                          : "-"}
                      </li>
                      <li>
                        PnL %:{" "}
                        {selectedRun.pnl_pct !== null &&
                        selectedRun.pnl_pct !== undefined
                          ? `${formatNumber(selectedRun.pnl_pct, 4)}%`
                          : "-"}
                      </li>
                    </ul>
                  </article>

                  <article className="analysis-card yellow-card">
                    <div className="analysis-title">
                      <div className="mini-icon decision-icon" />
                      <h3>System Decision</h3>
                    </div>

                    <p>
                      The system action for this run was{" "}
                      <strong>{getActionLabel(selectedRun.action)}</strong>.
                    </p>

                    <p>
                      If the signal was HOLD, no order was executed. If an open
                      position existed, the 24h fixed holding logic prevented
                      duplicate entries. If the holding time expired, the paper
                      position was closed and PnL was recorded.
                    </p>
                  </article>
                </section>

                <aside className="fact-column">
                  <section className="key-facts-card">
                    <h3>▣ Key Facts</h3>

                    <div className="fact-row">
                      <span>Symbol</span>
                      <strong>{selectedRun.symbol}</strong>
                    </div>

                    <div className="fact-row">
                      <span>Signal</span>
                      <strong className={getSignalClass(selectedRun.signal)}>
                        {selectedRun.signal || "-"}
                      </strong>
                    </div>

                    <div className="fact-row">
                      <span>Action</span>
                      <strong>{getActionLabel(selectedRun.action)}</strong>
                    </div>

                    <div className="fact-row">
                      <span>Order Status</span>
                      <strong>{selectedRun.order_status || "-"}</strong>
                    </div>

                    <div className="fact-row">
                      <span>Position Status</span>
                      <strong>{selectedRun.position_status || "-"}</strong>
                    </div>

                    <div className="fact-row">
                      <span>PnL</span>
                      <strong
                        className={
                          selectedRun.pnl > 0
                            ? "positive"
                            : selectedRun.pnl < 0
                            ? "result-negative"
                            : ""
                        }
                      >
                        {selectedRun.pnl !== null &&
                        selectedRun.pnl !== undefined
                          ? formatNumber(selectedRun.pnl, 4)
                          : "-"}
                      </strong>
                    </div>

                    <div className="fact-row">
                      <span>PnL %</span>
                      <strong
                        className={
                          selectedRun.pnl_pct > 0
                            ? "positive"
                            : selectedRun.pnl_pct < 0
                            ? "result-negative"
                            : ""
                        }
                      >
                        {selectedRun.pnl_pct !== null &&
                        selectedRun.pnl_pct !== undefined
                          ? `${formatNumber(selectedRun.pnl_pct, 4)}%`
                          : "-"}
                      </strong>
                    </div>
                  </section>

                  <section className="risk-note-card">
                    <h3>⚠ Paper Trading Note</h3>
                    <p>
                      This history is based on paper execution. It does not mean
                      a real exchange order was filled. The purpose is to verify
                      the trading engine flow safely.
                    </p>
                  </section>

                  <section className="info-card">
                    <h3>ⓘ Execution Log</h3>
                    <p>
                      The history log stores each automated trading cycle,
                      including skipped HOLD signals, paper entries, holding
                      skips, position closes, and PnL results.
                    </p>

                    <p>
                      This data can be used for UI monitoring, debugging,
                      presentation, and later performance evaluation.
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