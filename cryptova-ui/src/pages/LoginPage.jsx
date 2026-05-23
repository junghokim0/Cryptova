import "../styles/LoginPage.css";
import logo from "../assets/logo.png";

function LoginPage({ onGoSignup }) {
  return (
    <div className="login-page">
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

      <main className="login-card">
        <button className="close-button" aria-label="Close">
          ×
        </button>

        <div className="logo-area">
          <img src={logo} alt="Cryptova Logo" className="card-logo" />
        </div>

        <section className="welcome-area">
          <h3>Welcome Back</h3>
          <p>Sign in to start trading</p>
        </section>

        <form className="login-form">
          <label className="input-box">
            <span className="input-icon">✉</span>
            <input type="email" placeholder="Email Address" />
          </label>

          <label className="input-box">
            <span className="input-icon">🔒</span>
            <input type="password" placeholder="Password" />
            <span className="eye-icon">◉</span>
          </label>

          <div className="form-options">
            <label className="remember-area">
              <input type="checkbox" defaultChecked />
              <span>Remember me</span>
            </label>

            <a href="#forgot">Forgot password?</a>
          </div>

          <button type="button" className="login-button">
            Sign In
          </button>
        </form>

        <div className="divider">
          <span />
          <p>OR</p>
          <span />
        </div>

        <p className="signup-text">
          Don&apos;t have an account?{" "}
          <button type="button" className="text-link-button" onClick={onGoSignup}>
            Sign Up
          </button>
        </p>
      </main>
    </div>
  );
}

export default LoginPage;