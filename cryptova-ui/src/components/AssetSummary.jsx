import { useEffect, useMemo, useState } from "react";
import { getExchangeBalance } from "../api/exchangeApi";
import { getPaperPortfolioSummary } from "../api/tradingApi";
import "../styles/AssetSummary.css";

function formatMoney(value) {
  const number = Number(value || 0);

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function formatPct(value) {
  const number = Number(value || 0);

  return `${number >= 0 ? "+" : ""}${number.toFixed(4)}%`;
}

function AssetSummary({ user }) {
  const [isOpen, setIsOpen] = useState(false);

  const [assetBalance, setAssetBalance] = useState(null);
  const [paperPortfolio, setPaperPortfolio] = useState(null);

  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState("");

  const exchangeTotalAsset = Number(assetBalance?.wallet_balance || 0);
  const paperTotalAsset = Number(paperPortfolio?.paper_total_asset || 10000);

  const availableBalance = Number(assetBalance?.available_balance || 0);
  const usedMargin = Number(assetBalance?.used_margin || 0);
  const exchangeUnrealizedPnl = Number(assetBalance?.unrealized_pnl || 0);

  const totalAssetDisplay = paperPortfolio
    ? `$${formatMoney(paperPortfolio.paper_total_asset)}`
    : assetBalance
    ? `$${formatMoney(assetBalance.wallet_balance)}`
    : "$10,000.00";

  const composition = useMemo(() => {
    if (!assetBalance || exchangeTotalAsset <= 0) {
      return {
        cashPct: 100,
        positionsPct: 0,
        othersPct: 0,
      };
    }

    const cashPct = Math.max(0, (availableBalance / exchangeTotalAsset) * 100);
    const positionsPct = Math.max(0, (usedMargin / exchangeTotalAsset) * 100);
    const othersPct = Math.max(0, 100 - cashPct - positionsPct);

    return {
      cashPct,
      positionsPct,
      othersPct,
    };
  }, [assetBalance, exchangeTotalAsset, availableBalance, usedMargin]);

  const loadAssetData = async () => {
    if (!user) {
      setAssetError("Please login to load asset data.");
      return;
    }

    try {
      setAssetLoading(true);
      setAssetError("");

      const [exchangeData, paperData] = await Promise.all([
        getExchangeBalance(),
        getPaperPortfolioSummary("BTCUSDT"),
      ]);

      setAssetBalance(exchangeData);
      setPaperPortfolio(paperData);
    } catch (error) {
      setAssetError(error.message || "Failed to load asset data.");
    } finally {
      setAssetLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadAssetData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleToggle = async () => {
    setIsOpen((prev) => !prev);

    if ((!assetBalance || !paperPortfolio) && !assetLoading && user) {
      await loadAssetData();
    }
  };

  return (
    <div className="asset-summary-root">
      <button type="button" className="asset-summary-button" onClick={handleToggle}>
        <span className="asset-summary-icon">▣</span>

        <div>
          <p>Paper Asset</p>
          <strong>{totalAssetDisplay}</strong>
        </div>

        <span className={isOpen ? "asset-summary-arrow open" : "asset-summary-arrow"}>
          ⌃
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="asset-summary-backdrop"
            onClick={() => setIsOpen(false)}
          />

          <aside className="asset-summary-panel">
            <button
              type="button"
              className="asset-summary-close-button"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>

            <h2>Asset</h2>

            <section className="asset-summary-card">
              <h3>Paper Portfolio</h3>

              {assetLoading ? (
                <p>Loading asset data...</p>
              ) : assetError ? (
                <p className="asset-summary-error">{assetError}</p>
              ) : paperPortfolio ? (
                <>
                  <div className="asset-summary-big-card paper-card">
                    <p>Paper Total Asset</p>
                    <strong>${formatMoney(paperPortfolio.paper_total_asset)}</strong>

                    <div>
                      <span>Total PnL</span>
                      <b
                        className={
                          Number(paperPortfolio.total_pnl) >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        ${formatMoney(paperPortfolio.total_pnl)}
                      </b>
                    </div>

                    <div>
                      <span>PnL %</span>
                      <b
                        className={
                          Number(paperPortfolio.total_pnl_pct) >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        {formatPct(paperPortfolio.total_pnl_pct)}
                      </b>
                    </div>
                  </div>

                  <div className="asset-summary-list">
                    <p>
                      <span>Initial Balance</span>
                      <strong>
                        ${formatMoney(paperPortfolio.initial_balance)}
                      </strong>
                    </p>

                    <p>
                      <span>Realized PnL</span>
                      <strong
                        className={
                          Number(paperPortfolio.realized_pnl) >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        ${formatMoney(paperPortfolio.realized_pnl)}
                      </strong>
                    </p>

                    <p>
                      <span>Unrealized PnL</span>
                      <strong
                        className={
                          Number(paperPortfolio.unrealized_pnl) >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        ${formatMoney(paperPortfolio.unrealized_pnl)}
                      </strong>
                    </p>

                    <p>
                      <span>Open Position</span>
                      <strong>
                        {paperPortfolio.open_position_side || "None"}
                      </strong>
                    </p>

                    <p>
                      <span>Closed Trades</span>
                      <strong>{paperPortfolio.closed_trade_count}</strong>
                    </p>
                  </div>
                </>
              ) : (
                <p>Paper portfolio data is not available.</p>
              )}
            </section>

            <section className="asset-summary-card">
              <h3>Bybit Testnet Asset</h3>

              {assetBalance ? (
                <>
                  <div className="asset-summary-big-card">
                    <p>Wallet Balance</p>
                    <strong>${formatMoney(assetBalance.wallet_balance)}</strong>

                    <div>
                      <span>Coin</span>
                      <b>{assetBalance.coin}</b>
                    </div>

                    <div>
                      <span>Testnet</span>
                      <b>{assetBalance.is_testnet ? "True" : "False"}</b>
                    </div>
                  </div>

                  <div className="asset-summary-list">
                    <p>
                      <span>Available Balance</span>
                      <strong>${formatMoney(assetBalance.available_balance)}</strong>
                    </p>

                    <p>
                      <span>Used Margin</span>
                      <strong>${formatMoney(assetBalance.used_margin)}</strong>
                    </p>

                    <p>
                      <span>Exchange Unrealized PnL</span>
                      <strong
                        className={exchangeUnrealizedPnl >= 0 ? "positive" : "negative"}
                      >
                        ${formatMoney(assetBalance.unrealized_pnl)}
                      </strong>
                    </p>

                    <p>
                      <span>Exchange</span>
                      <strong>{assetBalance.exchange}</strong>
                    </p>
                  </div>
                </>
              ) : (
                <p>Exchange asset data is not available.</p>
              )}
            </section>

            <section className="asset-composition-card">
              <h3>Bybit Asset Composition</h3>

              <div
                className="asset-summary-donut"
                style={{
                  background: `conic-gradient(
                    #4ade80 0 ${composition.cashPct}%,
                    #2563ff ${composition.cashPct}% ${composition.cashPct + composition.positionsPct}%,
                    #64748b ${composition.cashPct + composition.positionsPct}% 100%
                  )`,
                }}
              >
                <div>
                  <span>Total</span>
                  <strong>
                    ${formatMoney(exchangeTotalAsset || 10000)}
                  </strong>
                </div>
              </div>

              <div className="asset-composition-list">
                <p>
                  <span>
                    <b className="green-dot" /> Cash
                  </span>
                  <strong>{composition.cashPct.toFixed(1)}%</strong>
                </p>

                <p>
                  <span>
                    <b className="blue-dot" /> Positions
                  </span>
                  <strong>{composition.positionsPct.toFixed(1)}%</strong>
                </p>

                <p>
                  <span>
                    <b className="gray-dot" /> Others
                  </span>
                  <strong>{composition.othersPct.toFixed(1)}%</strong>
                </p>
              </div>
            </section>
          </aside>
        </>
      )}
    </div>
  );
}

export default AssetSummary;