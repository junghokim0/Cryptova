import { useEffect, useState } from "react";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import TradingPage from "./pages/TradingPage";
import HistoryPage from "./pages/HistoryPage";
import BacktestPage from "./pages/BacktestPage";
import { clearAuthData, getMe, getStoredToken, getStoredUser } from "./api/authApi";

function App() {
  const [page, setPage] = useState("home");
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState(null);

  useEffect(() => {
    async function checkAuth() {
      const token = getStoredToken();

      if (!token) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        const user = await getMe(token);
        setCurrentUser(user);
      } catch (error) {
        clearAuthData();
        setCurrentUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    }

    checkAuth();
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setPage("trading");
  };

  const handleLogout = () => {
    clearAuthData();
    setCurrentUser(null);
    setPage("home");
  };

  if (isCheckingAuth) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#020617",
          color: "#f8fafc",
          fontSize: "18px",
          fontWeight: 700,
        }}
      >
        Loading Cryptova...
      </div>
    );
  }

  if (page === "login") {
    return (
      <LoginPage
        onGoSignup={() => setPage("signup")}
        onGoHome={() => setPage("home")}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  if (page === "signup") {
    return (
      <SignupPage
        onGoLogin={() => setPage("login")}
        onGoHome={() => setPage("home")}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  if (page === "trading") {
    return (
      <TradingPage
        user={currentUser}
        onGoHome={() => setPage("home")}
        onGoLogin={() => setPage("login")}
        onGoHistory={() => {
          setSelectedHistoryRunId(null);
          setPage("history");
        }}
        onGoHistoryDetail={(runId) => {
          setSelectedHistoryRunId(runId);
          setPage("history");
        }}
        onGoBacktest={() => setPage("backtest")}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "history") {
    return (
      <HistoryPage
        user={currentUser}
        selectedRunId={selectedHistoryRunId}
        onGoHome={() => setPage("home")}
        onGoTrading={() => setPage("trading")}
        onGoBacktest={() => setPage("backtest")}
        onGoLogin={() => setPage("login")}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "backtest") {
    return (
      <BacktestPage
        user={currentUser}
        onGoHome={() => setPage("home")}
        onGoTrading={() => setPage("trading")}
        onGoHistory={() => setPage("history")}
        onGoLogin={() => setPage("login")}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <HomePage
      user={currentUser}
      onGoHome={() => setPage("home")}
      onGoTrading={() => setPage("trading")}
      onGoHistory={() => setPage("history")}
      onGoBacktest={() => setPage("backtest")}
      onGoLogin={() => setPage("login")}
      onGoSignup={() => setPage("signup")}
      onLogout={handleLogout}
    />
  );
}

export default App;