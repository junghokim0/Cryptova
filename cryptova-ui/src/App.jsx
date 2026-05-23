import { useState } from "react";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import TradingPage from "./pages/TradingPage";
import HistoryPage from "./pages/HistoryPage";
import BacktestPage from "./pages/BacktestPage";

function App() {
  const [page, setPage] = useState("home");

  if (page === "login") {
    return (
      <LoginPage
        onGoSignup={() => setPage("signup")}
        onGoHome={() => setPage("home")}
      />
    );
  }

  if (page === "signup") {
    return (
      <SignupPage
        onGoLogin={() => setPage("login")}
        onGoHome={() => setPage("home")}
      />
    );
  }

  if (page === "trading") {
    return (
      <TradingPage
        onGoHome={() => setPage("home")}
        onGoLogin={() => setPage("login")}
        onGoHistory={() => setPage("history")}
        onGoBacktest={() => setPage("backtest")}
      />
    );
  }

  if (page === "history") {
    return (
      <HistoryPage
        onGoHome={() => setPage("home")}
        onGoTrading={() => setPage("trading")}
        onGoBacktest={() => setPage("backtest")}
        onGoLogin={() => setPage("login")}
      />
    );
  }

  if (page === "backtest") {
    return (
      <BacktestPage
        onGoHome={() => setPage("home")}
        onGoTrading={() => setPage("trading")}
        onGoHistory={() => setPage("history")}
        onGoLogin={() => setPage("login")}
      />
    );
  }

  return (
    <HomePage
      onGoTrading={() => setPage("trading")}
      onGoHistory={() => setPage("history")}
      onGoBacktest={() => setPage("backtest")}
      onGoLogin={() => setPage("login")}
      onGoSignup={() => setPage("signup")}
    />
  );
}

export default App;