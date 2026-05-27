import AssetSummary from "../components/AssetSummary";
import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

import "../styles/TradingPage.css";
import logo from "../assets/logo.png";

import {
  getStrategySettings,
  saveStrategySettings,
} from "../api/strategyApi";

import { getSignals } from "../api/signalApi";

import { getCandles } from "../api/marketApi";
import {
  getOpenPositionPnl,
  getTradingMarkers,
  getTradingRuns,
  getAutoTradingStatus,
  startAutoTrading,
  stopAutoTrading,
  runTradingOnce,
} from "../api/tradingApi";

function TradingPage({
  user,
  onGoHome,
  onGoLogin,
  onGoHistory,
  onGoHistoryDetail,
  onGoBacktest,
  onLogout,
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [confidenceThreshold, setConfidenceThreshold] = useState(46);
  const [positionSize, setPositionSize] = useState(5);
  const [leverage, setLeverage] = useState(10);
  const [maxDrawdownStop, setMaxDrawdownStop] = useState(-10);

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");

  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [isChangingAutoTrading, setIsChangingAutoTrading] = useState(false);

  const [isStartingTrading, setIsStartingTrading] = useState(false);
  const [tradingMessage, setTradingMessage] = useState("");
  const [tradingError, setTradingError] = useState("");

  const [latestSignal, setLatestSignal] = useState(null);
  const [signals, setSignals] = useState([]);

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);

  const [latestPrice, setLatestPrice] = useState(null);
  const [latestPriceChangePct, setLatestPriceChangePct] = useState(null);

  const [positionPnl, setPositionPnl] = useState(null);
  const [tradingRuns, setTradingRuns] = useState([]);
  const [chartError, setChartError] = useState("");
  const [isChartLoading, setIsChartLoading] = useState(false);

  const [selectedTimeframe, setSelectedTimeframe] = useState("1D");
  const selectedTimeframeRef = useRef("1D");
  const chartRequestIdRef = useRef(0);

  const timeframeOptions = {
    "1H": {
      interval: "60",
      startDate: "2026-04-27",
    },
    "4H": {
      interval: "240",
      startDate: "2025-11-27",
    },
    "1D": {
      interval: "D",
      startDate: "2020-03-01",
    },
    "1W": {
      interval: "W",
      startDate: "2020-03-01",
    },
    "1M": {
      interval: "M",
      startDate: "2020-03-01",
    },
  };

  useEffect(() => {
    selectedTimeframeRef.current = selectedTimeframe;
  }, [selectedTimeframe]);

  useEffect(() => {
    async function loadSettings() {
      if (!user) return;

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
    loadAutoTradingStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!chartContainerRef.current) return;
    if (chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 520,
      layout: {
        background: { color: "#0f172a" },
        textColor: "#d1d5db",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#334155",
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
      crosshair: {
        mode: 1,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (!chartContainerRef.current || !chartRef.current) return;

      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
      });

      chartRef.current.timeScale().fitContent();
    };

    window.addEventListener("resize", handleResize);

    loadChartData("1D");

    const intervalId = setInterval(() => {
      loadChartData(selectedTimeframeRef.current);
    }, 300000);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearInterval(intervalId);

      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadLatestSignal = async () => {
    if (!user) return;

    try {
      const data = await getSignals();

      setSignals(data);

      if (data.length > 0) {
        setLatestSignal(data[0]);
      }
    } catch (error) {
      console.error("Failed to load latest signal:", error);
    }
  };

  const loadAutoTradingStatus = async () => {
    if (!user) return;

    try {
      const status = await getAutoTradingStatus();
      setAutoTradingEnabled(Boolean(status.auto_trading_enabled));
    } catch (error) {
      console.error("Failed to load auto trading status:", error);
    }
  };

  const loadChartData = async (timeframe = selectedTimeframeRef.current) => {
    if (!user) return;

    const requestId = chartRequestIdRef.current + 1;
    chartRequestIdRef.current = requestId;

    try {
      setIsChartLoading(true);
      setChartError("");

      const selectedOption =
        timeframeOptions[timeframe] || timeframeOptions["1D"];

      const candles = await getCandles({
        symbol: "BTCUSDT",
        interval: selectedOption.interval,
        category: "linear",
        startDate: selectedOption.startDate,
        pageLimit: 1000,
      });

      if (requestId !== chartRequestIdRef.current) return;

      const candleData = candles
        .map((item) => ({
          time: item.time,
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
        }))
        .filter(
          (item) =>
            item.time &&
            Number.isFinite(item.open) &&
            Number.isFinite(item.high) &&
            Number.isFinite(item.low) &&
            Number.isFinite(item.close)
        );

      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(candleData);

        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }

      if (candleData.length >= 2) {
        const last = candleData[candleData.length - 1];
        const prev = candleData[candleData.length - 2];

        setLatestPrice(last.close);

        if (prev.close > 0) {
          const changePct = ((last.close - prev.close) / prev.close) * 100;
          setLatestPriceChangePct(changePct);
        }
      }

      const markers = await getTradingMarkers({
        symbol: "BTCUSDT",
        limit: 100,
      });

      if (requestId !== chartRequestIdRef.current) return;

      const entryMarkers = markers
        .filter((marker) => marker.price > 0)
        .filter((marker) => marker.marker_type === "ENTRY");

      const exitMarkers = markers
        .filter((marker) => marker.price > 0)
        .filter((marker) => marker.marker_type === "EXIT");

      const latestEntry =
        entryMarkers.length > 0 ? entryMarkers[entryMarkers.length - 1] : null;

      const latestExit =
        exitMarkers.length > 0 ? exitMarkers[exitMarkers.length - 1] : null;

      const filteredMarkers = [latestEntry, latestExit].filter(Boolean);

      const chartMarkers = filteredMarkers.map((marker) => {
        let position = "belowBar";
        let shape = "circle";
        let color = "#9ca3af";

        if (marker.marker_type === "ENTRY") {
          position = marker.signal === "LONG" ? "belowBar" : "aboveBar";
          shape = marker.signal === "LONG" ? "arrowUp" : "arrowDown";
          color = marker.signal === "LONG" ? "#22c55e" : "#ef4444";
        }

        if (marker.marker_type === "EXIT") {
          position = "aboveBar";
          shape = "square";
          color = marker.color_hint === "green" ? "#22c55e" : "#ef4444";
        }

        return {
          time: marker.time,
          position,
          color,
          shape,
          text: "",
        };
      });

      if (candleSeriesRef.current) {
        candleSeriesRef.current.setMarkers(chartMarkers);
      }

      const pnl = await getOpenPositionPnl({
        symbol: "BTCUSDT",
      });

      if (requestId !== chartRequestIdRef.current) return;

      setPositionPnl(pnl);

      const runs = await getTradingRuns({
        limit: 10,
      });

      if (requestId !== chartRequestIdRef.current) return;

      setTradingRuns(runs);
    } catch (error) {
      console.error(error);
      setChartError(error.message || "Failed to load chart data.");
    } finally {
      if (requestId === chartRequestIdRef.current) {
        setIsChartLoading(false);
      }
    }
  };

  const handleTimeframeChange = (timeframe) => {
    selectedTimeframeRef.current = timeframe;
    setSelectedTimeframe(timeframe);
    loadChartData(timeframe);
  };

  const handleUseRecommendedSettings = () => {
    setConfidenceThreshold(46);
    setPositionSize(1);
    setLeverage(1);
    setMaxDrawdownStop(-10);

    setSettingsMessage(
      "Recommended settings applied. Click Save Settings to store them."
    );
    setSettingsError("");
  };

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

  const handleStartAutoTrading = async () => {
    setTradingMessage("");
    setTradingError("");

    if (!user) {
      setTradingError("Please login before starting auto trading.");
      return;
    }

    try {
      setIsChangingAutoTrading(true);

      const result = await startAutoTrading();

      setAutoTradingEnabled(Boolean(result.auto_trading_enabled));
      setTradingMessage(result.message || "Auto trading started.");

      await loadAutoTradingStatus();
      await loadChartData(selectedTimeframeRef.current);
    } catch (error) {
      setTradingError(error.message || "Failed to start auto trading.");
    } finally {
      setIsChangingAutoTrading(false);
    }
  };

  const handleStopAutoTrading = async () => {
    setTradingMessage("");
    setTradingError("");

    if (!user) {
      setTradingError("Please login before stopping auto trading.");
      return;
    }

    try {
      setIsChangingAutoTrading(true);

      const result = await stopAutoTrading();

      setAutoTradingEnabled(Boolean(result.auto_trading_enabled));
      setTradingMessage(result.message || "Auto trading stopped.");

      await loadAutoTradingStatus();
      await loadChartData(selectedTimeframeRef.current);
    } catch (error) {
      setTradingError(error.message || "Failed to stop auto trading.");
    } finally {
      setIsChangingAutoTrading(false);
    }
  };
  const handleGoExplanationHistory = () => {
    if (tradingRuns.length > 0 && onGoHistoryDetail) {
      onGoHistoryDetail(tradingRuns[0].id);
      return;
    }

    if (onGoHistory) {
      onGoHistory();
    }
  };
  const handleRunOnce = async () => {
    setTradingMessage("");
    setTradingError("");

    if (!user) {
      setTradingError("Please login before running trading.");
      return;
    }

    try {
      setIsStartingTrading(true);

      const result = await runTradingOnce();

      setTradingMessage(result.message || "Trading run completed.");

      await loadLatestSignal();
      await loadChartData(selectedTimeframeRef.current);
    } catch (error) {
      setTradingError(error.message || "Failed to run trading.");
    } finally {
      setIsStartingTrading(false);
    }
  };
  const getRunActionLabel = (run) => {
    if (!run) return "-";

    if (run.action === "PAPER_ORDER_OPENED") {
      if (run.signal === "LONG") return "LONG Entry";
      if (run.signal === "SHORT") return "SHORT Entry";
      return "Entry";
    }

    if (run.action === "CLOSED_POSITION") return "Position Closed";
    if (run.action === "SKIPPED_HOLDING") return "Holding";
    if (run.action === "SKIPPED_SIGNAL") return "Signal Skipped";
    if (run.action === "DRY_RUN_ORDER") return "Test Entry";
    if (run.action === "ORDER_FAILED") return "Order Failed";

    return run.action || "-";
  };

  const formattedPrice =
    latestPrice !== null ? Number(latestPrice).toLocaleString() : "--";

  const formattedChange =
    latestPriceChangePct !== null
      ? `${latestPriceChangePct >= 0 ? "+" : ""}${latestPriceChangePct.toFixed(
          2
        )}%`
      : "--";

  const changeClass =
    latestPriceChangePct !== null && latestPriceChangePct >= 0
      ? "positive"
      : "negative";

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

        <AssetSummary user={user} />

        {user ? (
          <button
            type="button"
            className="trading-login-button"
            onClick={onLogout}
          >
            <span>♙</span>
            Logout
          </button>
        ) : (
          <button
            type="button"
            className="trading-login-button"
            onClick={onGoLogin}
          >
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
                      min="30"
                      max="90"
                      step="1"
                      value={confidenceThreshold}
                      onChange={(e) =>
                        setConfidenceThreshold(Number(e.target.value))
                      }
                      style={{
                        "--value": `${
                          ((confidenceThreshold - 30) / (90 - 30)) * 100
                        }%`,
                      }}
                    />

                    <div className="range-meta">
                      <span>30%</span>
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

                <button
                  type="button"
                  className="recommended-button"
                  onClick={handleUseRecommendedSettings}
                >
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

                <div className="auto-trading-status-box">
                  <span>Auto Trading</span>
                  <strong className={autoTradingEnabled ? "auto-on" : "auto-off"}>
                    {autoTradingEnabled ? "ON" : "OFF"}
                  </strong>
                </div>

                {autoTradingEnabled ? (
                  <button
                    type="button"
                    className="stop-trading-button"
                    onClick={handleStopAutoTrading}
                    disabled={isChangingAutoTrading}
                  >
                    {isChangingAutoTrading ? "Stopping..." : "Stop Auto Trading"}{" "}
                    <span>■</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="start-trading-button"
                    onClick={handleStartAutoTrading}
                    disabled={isChangingAutoTrading}
                  >
                    {isChangingAutoTrading ? "Starting..." : "Start Auto Trading"}{" "}
                    <span>↗</span>
                  </button>
                )}

                <button
                  type="button"
                  className="run-once-button"
                  onClick={handleRunOnce}
                  disabled={isStartingTrading}
                >
                  {isStartingTrading ? "Running..." : "Run Once"}
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
                {formattedPrice}{" "}
                <span className={changeClass}>{formattedChange}</span>
              </h1>
            </div>

            <div className="chart-metrics">
              <div>
                <p>Paper Position</p>
                <strong>{positionPnl ? positionPnl.side : "None"}</strong>
              </div>

              <div>
                <p>Unrealized PnL</p>
                <strong
                  className={
                    positionPnl && positionPnl.unrealized_pnl >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  {positionPnl
                    ? `${Number(positionPnl.unrealized_pnl).toFixed(4)} USDT`
                    : "--"}
                </strong>
                <span>
                  {positionPnl
                    ? `${Number(positionPnl.unrealized_pnl_pct).toFixed(4)}%`
                    : "--"}
                </span>
              </div>

              <div>
                <p>Latest Signal</p>
                <strong
                  className={
                    latestSignal?.signal === "LONG"
                      ? "positive"
                      : latestSignal?.signal === "SHORT"
                      ? "negative"
                      : ""
                  }
                >
                  {latestSignal ? latestSignal.signal : "NO SIGNAL"}
                </strong>
                <span>{latestSignal ? `${latestSignal.confidence}%` : "--"}</span>
              </div>
            </div>
          </div>

          <div className="time-filter">
            {["1H", "4H", "1D", "1W", "1M"].map((timeframe) => (
              <button
                key={timeframe}
                type="button"
                className={selectedTimeframe === timeframe ? "selected" : ""}
                onClick={() => handleTimeframeChange(timeframe)}
              >
                {timeframe}
              </button>
            ))}

            <button
              type="button"
              onClick={() => loadChartData(selectedTimeframeRef.current)}
            >
              {isChartLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="main-chart-area real-chart-area">
            {chartError && <div className="chart-error-message">{chartError}</div>}

            {!user && (
              <div className="chart-error-message">
                로그인 후 차트를 확인할 수 있습니다.
              </div>
            )}

            <div ref={chartContainerRef} className="real-chart-container" />

            {isChartLoading && (
              <div className="chart-loading-message">
                차트 데이터를 불러오는 중...
              </div>
            )}
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

              {signals.slice(0, 5).map((signal) => (
                <div className="recent-signal-item" key={signal.id}>
                  <span
                    className={`signal-dot ${
                      signal.signal === "LONG"
                        ? "up"
                        : signal.signal === "SHORT"
                        ? "down"
                        : "hold"
                    }`}
                  >
                    {signal.signal === "LONG"
                      ? "↑"
                      : signal.signal === "SHORT"
                      ? "↓"
                      : "–"}
                  </span>

                  <div>
                    <strong
                      className={
                        signal.signal === "LONG"
                          ? "long"
                          : signal.signal === "SHORT"
                          ? "short"
                          : "hold"
                      }
                    >
                      {signal.signal}
                    </strong>
                    <p>{signal.symbol}</p>
                    <small>{signal.confidence}%</small>
                  </div>

                  <div className="signal-right">
                    <span>{new Date(signal.created_at).toLocaleString()}</span>
                    <b>{signal.status}</b>
                  </div>
                </div>
              ))}
            </div>

            <div className="paper-position-box">
              <h3>Current Paper Position</h3>

              {positionPnl ? (
                <div className="paper-position-list">
                  <div>
                    <span>Side</span>
                    <strong
                      className={positionPnl.side === "LONG" ? "long" : "short"}
                    >
                      {positionPnl.side}
                    </strong>
                  </div>

                  <div>
                    <span>Qty</span>
                    <strong>{positionPnl.qty}</strong>
                  </div>

                  <div>
                    <span>Entry</span>
                    <strong>{Number(positionPnl.entry_price).toFixed(2)}</strong>
                  </div>

                  <div>
                    <span>Current</span>
                    <strong>{Number(positionPnl.current_price).toFixed(2)}</strong>
                  </div>

                  <div>
                    <span>Unrealized PnL</span>
                    <strong
                      className={
                        positionPnl.unrealized_pnl >= 0 ? "long" : "short"
                      }
                    >
                      {Number(positionPnl.unrealized_pnl).toFixed(4)} USDT
                    </strong>
                  </div>

                  <div>
                    <span>Unrealized PnL %</span>
                    <strong
                      className={
                        positionPnl.unrealized_pnl_pct >= 0 ? "long" : "short"
                      }
                    >
                      {Number(positionPnl.unrealized_pnl_pct).toFixed(4)}%
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="no-paper-position">
                  현재 열린 Paper 포지션이 없습니다.
                </p>
              )}
            </div>
          </section>

          <section className="explanation-box">
            <div className="explanation-title">
              <button
                type="button"
                className="explanation-icon chat-icon explanation-link-button"
                onClick={handleGoExplanationHistory}
                title="View explanation history"
              >
                <span />
              </button>

              <button
                type="button"
                className="explanation-title-button"
                onClick={handleGoExplanationHistory}
              >
                AI Trade Explanation
              </button>
            </div>

            {latestSignal ? (
              <div className="explanation-content">
                <div className="explanation-item">
                  <strong>Reason</strong>
                  <p>
                    {latestSignal.reason_summary ||
                      "No reason summary is available for this signal."}
                  </p>
                </div>

                <div className="explanation-item">
                  <strong>Risk Filter</strong>
                  <p>
                    {latestSignal.filter_summary ||
                      "No risk filter summary is available."}
                  </p>
                </div>

                <div className="explanation-item">
                  <strong>News Context</strong>
                  <p>
                    {latestSignal.news_summary ||
                      "News summary is not connected yet."}
                  </p>
                </div>

                <div className="explanation-item">
                  <strong>Chart Context</strong>
                  <p>
                    {latestSignal.chart_summary ||
                      "Chart summary is not connected yet."}
                  </p>
                </div>
              </div>
            ) : (
              <p>
                AI Signal이 생성되면 진입 이유, 리스크 필터, 뉴스/차트 요약이 여기에 표시됩니다.
              </p>
            )}
          </section>

          <section className="trading-runs-box">
            <h3>Recent Auto Trading Runs</h3>

            {tradingRuns.length > 0 ? (
              <div className="trading-runs-list">
                {tradingRuns.map((run) => (
                  <div className="trading-run-item" key={run.id}>
                    <div className="run-item-top">
                      <strong>{getRunActionLabel(run)}</strong>
                      <span>{run.signal || "-"}</span>
                    </div>

                    <p>{run.message}</p>

                    <small>{new Date(run.executed_at).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-paper-position">
                아직 자동매매 실행 기록이 없습니다.
              </p>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default TradingPage;