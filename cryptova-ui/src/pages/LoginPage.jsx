import { useState } from "react";
import "../styles/LoginPage.css";
import logo from "../assets/logo.png";
import { loginUser, saveAuthData } from "../api/authApi";

function LoginPage({ onGoSignup, onGoHome, onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please enter your email and password.");
      return;
    }

    try {
      setIsLoading(true);

      const data = await loginUser({
        email,
        password,
      });

      saveAuthData(data);

      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (error) {
      setErrorMessage(error.message || "Login failed.");
    } finally {
      setIsLoading(false);
    }
  };

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
        <button className="close-button" aria-label="Close" onClick={onGoHome}>
          ×
        </button>

        <div className="logo-area">
          <img src={logo} alt="Cryptova Logo" className="card-logo" />
        </div>

        <section className="welcome-area">
          <h3>Welcome Back</h3>
          <p>Sign in to start trading</p>
        </section>

        <form className="login-form" onSubmit={handleLogin}>
          <label className="input-box">
            <span className="input-icon">✉</span>
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="input-box">
            <span className="input-icon">🔒</span>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="eye-icon">◉</span>
          </label>

          {errorMessage && <p className="auth-error-message">{errorMessage}</p>}

          <div className="form-options">
            <label className="remember-area">
              <input type="checkbox" defaultChecked />
              <span>Remember me</span>
            </label>
          </div>

          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? "Signing In..." : "Sign In"}
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