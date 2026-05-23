import { useState } from "react";
import "../styles/SignupPage.css";
import logo from "../assets/logo.png";
import { saveAuthData, signupUser } from "../api/authApi";

function SignupPage({ onGoLogin, onGoHome, onLoginSuccess }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isAgree, setIsAgree] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setErrorMessage("Please fill in all fields.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 72) {
      setErrorMessage("Password must be 72 characters or less.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (!isAgree) {
      setErrorMessage("Please agree to the Terms and Privacy Policy.");
      return;
    }

    try {
      setIsLoading(true);

      const data = await signupUser({
        email,
        name,
        password,
      });

      saveAuthData(data);

      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (error) {
      setErrorMessage(error.message || "Signup failed.");
    } finally {
      setIsLoading(false);
    }
  };

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
        <button className="close-button" aria-label="Close" onClick={onGoHome}>
          ×
        </button>

        <div className="logo-area">
          <img src={logo} alt="Cryptova Logo" className="card-logo" />
        </div>

        <section className="welcome-area">
          <h3>Create Account</h3>
          <p>Join Cryptova and start your AI trading journey</p>
        </section>

        <form className="signup-form" onSubmit={handleSignup}>
          <label className="input-box">
            <span className="input-icon">👤</span>
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

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

          <label className="input-box">
            <span className="input-icon">🔐</span>
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <span className="eye-icon">◉</span>
          </label>

          {errorMessage && <p className="auth-error-message">{errorMessage}</p>}

          <div className="terms-row">
            <label className="terms-area">
              <input
                type="checkbox"
                checked={isAgree}
                onChange={(e) => setIsAgree(e.target.checked)}
              />
              <span>
                I agree to the <a href="#terms">Terms</a> and{" "}
                <a href="#privacy">Privacy Policy</a>
              </span>
            </label>
          </div>

          <button type="submit" className="signup-button" disabled={isLoading}>
            {isLoading ? "Creating Account..." : "Create Account"}
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