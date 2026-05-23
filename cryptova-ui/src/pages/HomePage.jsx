import "../styles/HomePage.css";
import logo from "../assets/logo.png";

function HomePage({ onGoTrading, onGoLogin, onGoSignup, onGoHistory, onGoBacktest }) {
  const signalHistory = [
    {
      type: "LONG",
      pair: "BTC/USDT",
      confidence: "87%",
      time: "1 min ago",
      price: "67,842.31",
      direction: "up",
    },
    {
      type: "SHORT",
      pair: "ETH/USDT",
      confidence: "75%",
      time: "15 min ago",
      price: "3,712.45",
      direction: "down",
    },
    {
      type: "LONG",
      pair: "SOL/USDT",
      confidence: "82%",
      time: "1 hour ago",
      price: "164.23",
      direction: "up",
    },
    {
      type: "SHORT",
      pair: "AVAX/USDT",
      confidence: "78%",
      time: "2 hours ago",
      price: "25.68",
      direction: "down",
    },
    {
      type: "LONG",
      pair: "LINK/USDT",
      confidence: "80%",
      time: "3 hours ago",
      price: "18.94",
      direction: "up",
    },
  ];

  return (
    <div className="home-page">
      <div className="home-bg-grid" />
      <div className="home-glow home-glow-left" />
      <div className="home-glow home-glow-right" />
      <div className="home-wave" />

      <header className="home-navbar">
        <button type="button" className="home-logo-button">
          <img src={logo} alt="Cryptova Logo" className="home-logo" />
        </button>

        <nav className="home-nav-menu">
          <button className="nav-link" onClick={onGoTrading}>
            Trading
          </button>
          <button className="nav-link" onClick={onGoHistory}>
            History
          </button>
          <button className="nav-link" onClick={onGoBacktest}>
            Backtest
          </button>
        </nav>

        <button type="button" className="nav-login-button" onClick={onGoLogin}>
          <span className="nav-user-icon">♙</span>
          Login / Sign Up
        </button>
      </header>

      <main className="home-main">
        <section className="hero-left">
          <div className="eyebrow">
            <span className="eyebrow-icon">✦</span>
            AI-POWERED CRYPTO TRADING
          </div>

          <h1>
            Smarter Trades.
            <br />
            Stronger <span>Results.</span>
          </h1>

          <p className="hero-description">
            Experience smarter market prediction and automated trading
            strategies powered by AI and data analysis.
          </p>

          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={onGoLogin}>
              Login / Sign Up <span>→</span>
            </button>
          </div>
        </section>

        <section className="hero-visual">
          <div className="trading-card">
            <div className="trading-card-header">
              <div>
                <p className="pair">BTC/USDT⌄</p>
                <h2>
                  67,842.31 <span>+2.35%</span>
                </h2>
              </div>

              <div className="metric-row">
                <div className="mini-metric">
                  <p>Total Balance</p>
                  <strong>$128,742.59</strong>
                </div>
                <div className="mini-metric green">
                  <p>Daily PnL</p>
                  <strong>+$5,382.21</strong>
                  <span>+4.35%</span>
                </div>
                <div className="mini-metric green">
                  <p>Total Return</p>
                  <strong>+$28,742.59</strong>
                  <span>+28.68%</span>
                </div>
              </div>
            </div>

            <div className="chart-toolbar">
              <span />
              <div>
                <button>1H</button>
                <button>4H</button>
                <button className="selected">1D</button>
                <button>1W</button>
                <button>1M</button>
              </div>
            </div>

            <div className="fake-chart">
              <svg viewBox="0 0 680 300" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineGlow" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="55%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#60a5fa" />
                  </linearGradient>
                </defs>

                <g className="grid-lines">
                  <line x1="0" y1="50" x2="680" y2="50" />
                  <line x1="0" y1="100" x2="680" y2="100" />
                  <line x1="0" y1="150" x2="680" y2="150" />
                  <line x1="0" y1="200" x2="680" y2="200" />
                  <line x1="0" y1="250" x2="680" y2="250" />
                </g>

                <polyline
                  className="chart-line"
                  points="20,210 60,160 95,180 130,120 170,80 210,95 250,170 295,220 335,190 380,130 420,145 460,100 505,115 545,88 590,125 640,105"
                />

                <polyline
                  className="chart-line-soft"
                  points="20,230 60,200 95,190 130,170 170,130 210,120 250,160 295,205 335,210 380,180 420,150 460,135 505,130 545,118 590,125 640,112"
                />

                {[
                  [45, 210, 34, "up"],
                  [78, 160, 46, "up"],
                  [112, 180, 39, "down"],
                  [150, 120, 58, "up"],
                  [188, 80, 72, "up"],
                  [225, 95, 52, "down"],
                  [262, 170, 42, "down"],
                  [300, 220, 36, "down"],
                  [340, 190, 44, "up"],
                  [382, 130, 60, "up"],
                  [420, 145, 52, "down"],
                  [458, 100, 66, "up"],
                  [500, 115, 55, "down"],
                  [542, 88, 75, "up"],
                  [585, 125, 60, "down"],
                  [630, 105, 70, "up"],
                ].map(([x, y, h, type], index) => (
                  <g key={index} className={`candle-svg ${type}`}>
                    <line x1={x} y1={y - h / 2} x2={x} y2={y + h / 2} />
                    <rect x={x - 6} y={y - h / 4} width="12" height={h / 2} rx="2" />
                  </g>
                ))}
              </svg>

              <div className="price-label">$67,842.31</div>
              <div className="chart-axis right">
                <span>70,000.00</span>
                <span>67,500.00</span>
                <span>65,000.00</span>
                <span>62,500.00</span>
                <span>60,000.00</span>
                <span>57,500.00</span>
              </div>

              <div className="chart-axis bottom">
                <span>May 1</span>
                <span>May 8</span>
                <span>May 15</span>
                <span>May 22</span>
                <span>May 29</span>
              </div>
            </div>
          </div>

          <aside className="signal-card">
            <h3>AI Signal</h3>

            <div className="signal-gauge">
              <div className="gauge-ring">
                <div className="gauge-inner">
                  <strong>LONG</strong>
                  <span>Confidence</span>
                  <b>87%</b>
                </div>
              </div>
            </div>

            <div className="signal-history">
              <h4>Recent Signals</h4>

              {signalHistory.map((item) => (
                <div className="signal-item" key={`${item.pair}-${item.time}`}>
                  <span className={`signal-icon ${item.direction}`}>
                    {item.direction === "up" ? "↑" : "↓"}
                  </span>

                  <div className="signal-info">
                    <strong className={item.type === "LONG" ? "long" : "short"}>
                      {item.type}
                    </strong>
                    <p>{item.pair}</p>
                    <small>{item.confidence}</small>
                  </div>

                  <div className="signal-meta">
                    <span>{item.time}</span>
                    <strong>{item.price}</strong>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>

      <section className="feature-panel">
        <article>
            <div className="feature-icon ai-icon">
            <span className="ai-node node-1" />
            <span className="ai-node node-2" />
            <span className="ai-node node-3" />
            <span className="ai-node node-4" />
            <span className="ai-core" />
            </div>
            <div>
            <h3>AI Market Analysis</h3>
            <p>
                Analyze live news, on-chain data, and technical indicators to
                predict market direction.
            </p>
            </div>
        </article>

        <article>
            <div className="feature-icon lightning-icon">
            <span />
            </div>
            <div>
            <h3>Automated Trading</h3>
            <p>
                Execute strategies automatically and manage risk based on selected
                trading rules.
            </p>
            </div>
        </article>

        <article>
            <div className="feature-icon bars-icon">
            <span />
            <span />
            <span />
            </div>
            <div>
            <h3>Backtesting & Simulation</h3>
            <p>
                Validate strategies using historical data and simulate expected
                performance.
            </p>
            </div>
        </article>

        <article>
            <div className="feature-icon chat-icon">
            <span />
            </div>
            <div>
            <h3>
                AI Trade Explanation
            </h3>
            <p>
                Explain why each LONG or SHORT signal was generated using market
                context.
            </p>
            </div>
        </article>
        </section>
    </div>
  );
}

export default HomePage;