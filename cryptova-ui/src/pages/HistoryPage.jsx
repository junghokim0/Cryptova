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

function getDisplayAction(run) {
  if (!run) return "-";

  const signal = run.signal;

  if (run.action === "PAPER_ORDER_OPENED") {
    if (signal === "LONG") return "LONG Entry";
    if (signal === "SHORT") return "SHORT Entry";
    return "Entry";
  }

  if (run.action === "REAL_ORDER_SUBMITTED") {
    if (signal === "LONG") return "LONG Entry";
    if (signal === "SHORT") return "SHORT Entry";
    return "Entry";
  }

  if (run.action === "DRY_RUN_ORDER") {
    if (signal === "LONG") return "LONG Test";
    if (signal === "SHORT") return "SHORT Test";
    return "Test Entry";
  }

  if (run.action === "SKIPPED_HOLDING") return "Holding";
  if (run.action === "SKIPPED_SIGNAL") return "Signal Skipped";
  if (run.action === "CLOSED_POSITION") return "Position Closed";
  if (run.action === "ORDER_FAILED") return "Order Failed";

  return run.action || "-";
}

function getDisplayOrderStatus(status) {
  if (!status) return "-";

  if (status === "PAPER_SUBMITTED") return "OPEN";
  if (status === "SUBMITTED") return "OPEN";
  if (status === "PAPER_CLOSED") return "CLOSED";
  if (status === "CLOSED") return "CLOSED";
  if (status === "DRY_RUN") return "TEST";
  if (status === "SKIPPED") return "SKIPPED";
  if (status === "FAILED") return "FAILED";

  return status;
}

function getDisplayPositionStatus(status) {
  if (!status) return "-";
  if (status === "OPEN") return "OPEN";
  if (status === "CLOSED") return "CLOSED";
  return status;
}

function getDisplayEngineLabel(run) {
  if (!run) return "Trading Engine";

  if (run.order_status === "DRY_RUN") {
    return "Test Engine";
  }

  if (run.order_status === "SUBMITTED") {
    return "Exchange Engine";
  }

  if (
    run.order_status === "PAPER_SUBMITTED" ||
    run.order_status === "PAPER_CLOSED" ||
    run.message?.toLowerCase().includes("paper")
  ) {
    return "Paper Engine";
  }

  return "Trading Engine";
}

function getDisplayExecutionMessage(run) {
  if (!run) return "-";

  if (run.action === "PAPER_ORDER_OPENED") {
    if (run.signal === "LONG") {
      return "A LONG paper position was opened successfully. Since no exchange order was filled, the trade was recorded in the paper trading engine for safe strategy verification.";
    }

    if (run.signal === "SHORT") {
      return "A SHORT paper position was opened successfully. Since no exchange order was filled, the trade was recorded in the paper trading engine for safe strategy verification.";
    }

    return "A paper position was opened successfully for strategy verification.";
  }

  if (run.action === "REAL_ORDER_SUBMITTED") {
    if (run.signal === "LONG") {
      return "A LONG position entry was submitted successfully.";
    }

    if (run.signal === "SHORT") {
      return "A SHORT position entry was submitted successfully.";
    }

    return "A position entry was submitted successfully.";
  }

  if (run.action === "SKIPPED_HOLDING") {
    return "An open position already exists, so the system kept the current position instead of opening a duplicate trade.";
  }

  if (run.action === "SKIPPED_SIGNAL") {
    return "The final signal was HOLD, so no new position was opened.";
  }

  if (run.action === "CLOSED_POSITION") {
    return "The 24-hour holding period expired, so the system closed the position and recorded the realized PnL.";
  }

  if (run.action === "DRY_RUN_ORDER") {
    return "This was a test execution. The system verified the trading flow without using exchange execution.";
  }

  if (run.action === "ORDER_FAILED") {
    return run.message || "The order failed during execution.";
  }

  return run.message || "Trading run completed.";
}

function getDisplaySystemDecision(run) {
  if (!run) return "-";

  if (run.action === "PAPER_ORDER_OPENED") {
    return `The system opened a ${run.signal || ""} position for this run. The signal passed the configured checks, so the paper trading engine recorded an OPEN position.`;
  }

  if (run.action === "REAL_ORDER_SUBMITTED") {
    return `The system submitted a ${run.signal || ""} position entry to the exchange engine.`;
  }

  if (run.action === "SKIPPED_HOLDING") {
    return "The system kept the current open position because the 24-hour fixed holding period has not expired yet.";
  }

  if (run.action === "SKIPPED_SIGNAL") {
    return "The system did not open a position because the final signal was HOLD.";
  }

  if (run.action === "CLOSED_POSITION") {
    return "The system closed the position because the 24-hour fixed holding period expired.";
  }

  if (run.action === "DRY_RUN_ORDER") {
    return "The system executed a test run to verify the trading flow without using exchange execution.";
  }

  if (run.action === "ORDER_FAILED") {
    return "The system attempted to process the order, but execution failed.";
  }

  return `The system action for this run was ${getDisplayAction(run)}.`;
}

function getStatusClass(run) {
  if (!run) return "closed";

  if (run.action === "PAPER_ORDER_OPENED") return "holding";
  if (run.action === "REAL_ORDER_SUBMITTED") return "holding";
  if (run.action === "SKIPPED_HOLDING") return "holding";
  if (run.action === "CLOSED_POSITION") return "closed";
  if (run.action === "ORDER_FAILED") return "stopped";

  return "closed";
}

function getDisplayRunStatus(run) {
  if (!run) return "LOG";

  const positionStatus = getDisplayPositionStatus(run.position_status);

  if (positionStatus !== "-") {
    return positionStatus;
  }

  const orderStatus = getDisplayOrderStatus(run.order_status);

  if (orderStatus !== "-") {
    return orderStatus;
  }

  return "LOG";
}

function HistoryPage({
  user,
  selectedRunId,
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
        if (selectedRunId) {
          const exists = data.some((run) => run.id === selectedRunId);
          setSelectedId(exists ? selectedRunId : data[0].id);
        } else {
          setSelectedId((prev) => prev || data[0].id);
        }
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
  }, [user, selectedRunId]);

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
                      {getDisplayAction(run)}
                    </strong>
                  </div>

                  <span className={`status-pill ${getStatusClass(run)}`}>
                    {getDisplayRunStatus(run)}
                  </span>
                </div>

                <div className="signal-card-bottom">
                  <span>{formatDateTime(run.executed_at)}</span>

                  <div>
                    <p>Order Status</p>
                    <strong>{getDisplayOrderStatus(run.order_status)}</strong>
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
                  <strong>{getDisplayAction(selectedRun)}</strong>
                </div>

                <div className="summary-stat">
                  <p>Order</p>
                  <strong>{getDisplayOrderStatus(selectedRun.order_status)}</strong>
                </div>

                <div className="summary-stat">
                  <p>Position</p>
                  <strong>
                    {getDisplayPositionStatus(selectedRun.position_status)}
                  </strong>
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
                      <b>{getDisplayAction(selectedRun)}</b>
                    </div>

                    <p>{getDisplayExecutionMessage(selectedRun)}</p>

                    <p>
                      This log was generated by the automated trading cycle.
                      It records whether the system opened a position, skipped a
                      signal, held an existing position, or closed a position.
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
                      <li>
                        Order Status:{" "}
                        {getDisplayOrderStatus(selectedRun.order_status)}
                      </li>
                    </ul>
                  </article>

                  <article className="analysis-card purple-card">
                    <div className="analysis-title">
                      <div className="mini-icon filter-icon" />
                      <h3>
                        <span>3</span> Position Result
                      </h3>
                      <b>{getDisplayEngineLabel(selectedRun)}</b>
                    </div>

                    <ul className="check-list">
                      <li>Position ID: {selectedRun.position_id || "-"}</li>
                      <li>
                        Position Status:{" "}
                        {getDisplayPositionStatus(selectedRun.position_status)}
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

                    <p>{getDisplaySystemDecision(selectedRun)}</p>
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
                      <strong>{getDisplayAction(selectedRun)}</strong>
                    </div>

                    <div className="fact-row">
                      <span>Order Status</span>
                      <strong>
                        {getDisplayOrderStatus(selectedRun.order_status)}
                      </strong>
                    </div>

                    <div className="fact-row">
                      <span>Position Status</span>
                      <strong>
                        {getDisplayPositionStatus(selectedRun.position_status)}
                      </strong>
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