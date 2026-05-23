import "../styles/SignupPage.css";
import logo from "../assets/logo.png";

function SignupPage({ onGoLogin }) {
  return (
    <div className="signup-page">
      <div className="background-glow glow-left" />
      <div className="background-glow glow-right" />

      <header className="brand-header">
        <img src={logo} alt="Cryptova Logo" className="header-logo" />
      </header>

      <div className="candles candles-left">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="candles candles-right">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <main className="signup-card">
        <button className="close-button" aria-label="Close">
          ×
        </button>

        <div className="logo-area">
          <img src={logo} alt="Cryptova Logo" className="card-logo" />
        </div>

        <section className="welcome-area">
          <h3>Create Account</h3>
          <p>Join Cryptova and start your AI trading journey</p>
        </section>

        <form className="signup-form">
          <label className="input-box">
            <span className="input-icon">👤</span>
            <input type="text" placeholder="Full Name" />
          </label>

          <label className="input-box">
            <span className="input-icon">✉</span>
            <input type="email" placeholder="Email Address" />
          </label>

          <label className="input-box">
            <span className="input-icon">🔒</span>
            <input type="password" placeholder="Password" />
            <span className="eye-icon">◉</span>
          </label>

          <label className="input-box">
            <span className="input-icon">🔐</span>
            <input type="password" placeholder="Confirm Password" />
            <span className="eye-icon">◉</span>
          </label>

          <div className="terms-row">
            <label className="terms-area">
              <input type="checkbox" defaultChecked />
              <span>
                I agree to the <a href="#terms">Terms</a> and{" "}
                <a href="#privacy">Privacy Policy</a>
              </span>
            </label>
          </div>

          <button type="button" className="signup-button">
            Create Account
          </button>
        </form>

        <div className="divider">
          <span />
          <p>OR</p>
          <span />
        </div>

        <p className="signin-text">
          Already have an account?{" "}
          <button type="button" className="text-link-button" onClick={onGoLogin}>
            Sign In
          </button>
        </p>
      </main>
    </div>
  );
}

export default SignupPage;