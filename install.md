# Cryptova Installation and Setup Guide

Cryptova is an AI-powered cryptocurrency trading assistant system.

The project consists of a React frontend, FastAPI backend, AI inference server, and MySQL database. Users can register, log in, save trading strategies, and validate automated paper trading workflows based on AI-generated LONG, SHORT, and HOLD signals.

---

# 1. Environment Requirements

This guide assumes a local development environment.

| Category        | Technology                   |
| --------------- | ---------------------------- |
| Frontend        | React, Vite, JavaScript      |
| Backend         | Python, FastAPI, SQLAlchemy  |
| AI Server       | Python, FastAPI              |
| Database        | MySQL                        |
| External APIs   | Bybit Public API, Gemini API |
| Package Manager | npm, pip                     |

Recommended environment:

```text
Python 3.10 or higher
Node.js 18 or higher
npm
MySQL 8.x
Git
VS Code or PowerShell
```

---

# 2. Project Structure

```text
Cryptova/
├─ cryptova-back/      # FastAPI backend server
├─ cryptova-ui/        # React frontend
└─ cryptova-ai/        # AI inference server
```

| Folder        | Description                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| cryptova-back | Provides authentication, strategy settings, automated trading, position management, and backtesting APIs |
| cryptova-ui   | Provides Trading, History, and Backtest user interfaces                                                  |
| cryptova-ai   | Returns AI signals through the `/predict/latest` endpoint                                                |

---

# 3. Prerequisites

Before running the project, ensure the following requirements are met:

1. MySQL server is running
2. Backend `.env` file is configured
3. Python packages are installed
4. npm packages are installed
5. AI server is available

---

# 4. Database Setup

Connect to MySQL and create the database used by the project.

```sql
CREATE DATABASE cryptova_db;
```

If the database already exists, this step can be skipped.

The backend automatically creates required tables during startup using SQLAlchemy's `Base.metadata.create_all()`.

The main tables include:

```text
users
strategy_settings
ai_signals
orders
trading_positions
trading_runs
api_keys
backtest_results
```

---

# 5. Backend Environment Variables

Create a `.env` file inside the `cryptova-back` directory.

```env
APP_NAME=Cryptova
APP_ENV=local

DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/cryptova_db

JWT_SECRET_KEY=change-this-secret-key
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

AUTO_TRADING_INTERVAL_MINUTES=60

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
BYBIT_PUBLIC_BASE=https://api.bybit.com
```

Notes:

* Replace the MySQL password in `DATABASE_URL` with your own password.
* If `GEMINI_API_KEY` is not provided, the system will use fallback explanations instead of Gemini-generated explanations.
* `AUTO_TRADING_INTERVAL_MINUTES` defines the automated trading execution interval.
* For testing, 1 minute is recommended. For normal operation, 60 minutes is recommended.

---

# 6. Backend Installation and Execution

Navigate to the backend directory.

```powershell
cd C:\Users\User\Desktop\Cryptova\cryptova-back
```

Create a virtual environment.

```powershell
python -m venv venv
```

Activate the virtual environment.

```powershell
.\venv\Scripts\activate
```

Install required packages.

```powershell
pip install -r requirements.txt
```

If `requirements.txt` is unavailable, install the main packages manually.

```powershell
pip install fastapi uvicorn sqlalchemy pymysql python-dotenv python-jose passlib[bcrypt] apscheduler httpx requests google-generativeai
```

Start the backend server.

```powershell
python -m uvicorn app.main:app --reload
```

Backend URL:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

---

# 7. AI Server Installation and Execution

Navigate to the AI server directory.

```powershell
cd C:\Users\User\Desktop\Cryptova\cryptova-ai
```

Create and activate a virtual environment.

```powershell
python -m venv venv
.\venv\Scripts\activate
```

Install required packages.

```powershell
pip install -r requirements.txt
```

If `requirements.txt` is unavailable:

```powershell
pip install fastapi uvicorn pandas numpy torch scikit-learn
```

Start the AI server.

```powershell
python -m uvicorn app:app --port 8001 --reload
```

AI Server URL:

```text
http://127.0.0.1:8001
```

The backend communicates with the AI server through the following endpoint:

```text
POST http://127.0.0.1:8001/predict/latest
```

---

# 8. Frontend Installation and Execution

Navigate to the frontend directory.

```powershell
cd C:\Users\User\Desktop\Cryptova\cryptova-ui
```

Install npm packages.

```powershell
npm install
```

Start the development server.

```powershell
npm run dev
```

Open the application in your browser:

```text
http://localhost:5173
```

or

```text
http://127.0.0.1:5173
```

---

# 9. Quick Start

Run the project in the following order:

1. Start MySQL
2. Verify backend `.env` settings
3. Start the backend server
4. Start the AI server
5. Start the frontend
6. Open `http://localhost:5173`
7. Register or log in
8. Save strategy settings
9. Execute Run Once
10. Review results in the History and Backtest pages

---

# 10. Feature Testing

## 10.1 Registration and Login

Open:

```text
http://localhost:5173
```

If registration or login is successful, you should be redirected to the Trading page.

---

## 10.2 Save Strategy Settings

Configure the following values in the Strategy Settings panel.

| Setting              | Test Value |
| -------------------- | ---------- |
| Confidence Threshold | 46         |
| Position Size        | 1          |
| Leverage             | 1          |
| Max Drawdown Stop    | -10        |
| Holding Strategy     | 24h Fixed  |

Click **Save Settings**.

Expected backend logs:

```text
POST /strategy/settings 200 OK
GET /strategy/settings 200 OK
```

---

## 10.3 Run Once

Click the **Run Once** button on the Trading page.

Expected workflow:

1. AI signal generation
2. Risk filter application
3. Paper entry creation or HOLD decision
4. Trading run saved
5. History page updated

Example backend logs:

```text
POST /trading/run-once 200 OK
GET /signals 200 OK
GET /positions/open/pnl?symbol=BTCUSDT 200 OK
GET /trading/runs?limit=10 200 OK
```

---

## 10.4 Verify Paper Position

After running Run Once, check the Current Paper Position or Recent Runs section.

Example:

```text
Action: SHORT Entry
Order Status: OPEN
Position Status: OPEN
```

Depending on the AI prediction, LONG Entry may also occur.

---

## 10.5 History Page

Navigate to the History page and verify the following information:

* Signal
* Action
* Order Status
* Position Status
* PnL
* Execution Summary
* System Decision

---

## 10.6 Backtest

Run a backtest using the following values:

| Setting              | Test Value |
| -------------------- | ---------- |
| Symbol               | BTCUSDT    |
| Start Date           | 2026-01-03 |
| End Date             | 2026-03-30 |
| Confidence Threshold | 46         |
| Position Size        | 1          |
| Max Drawdown Stop    | -10        |

Expected metrics:

* Total Return
* CAGR
* Sharpe Ratio
* Maximum Drawdown (MDD)
* Win Rate
* Trade Count
* Equity Curve
* Drawdown

---

# 11. Common Issues and Solutions

## 11.1 `/auth/me 401 Unauthorized`

### Cause

The login token is missing or expired.

### Solution

1. Log out and log in again.
2. Verify that `access_token` exists in localStorage.
3. Check the authentication logic if the token is missing.

---

## 11.2 `/exchange/balance 404 Not Found`

### Cause

No Bybit API key has been registered.

### Solution

The project is designed primarily for paper trading. Paper portfolio functionality will continue to work without exchange API keys.

---

## 11.3 `Bybit API key is not registered`

### Cause

The user's exchange API key has not been saved in the database.

### Solution

Use paper trading for validation. Run Once will create paper trading records instead of real orders.

---

## 11.4 `Too many visits. Exceeded the API Rate Limit`

### Cause

The Bybit Public API was called too frequently.

### Solution

1. Avoid repeated page refreshes.
2. Avoid rapidly changing chart timeframes.
3. Consider implementing caching or database storage optimizations.

---

## 11.5 `GEMINI_EXPLANATION_ERROR`

### Cause

Possible reasons include Gemini quota limits, invalid model configuration, API key issues, or response delays.

### Solution

1. Verify that `GEMINI_API_KEY` is configured correctly.
2. Check Gemini quota availability.
3. The system will automatically generate fallback explanations if Gemini fails.

---

## 11.6 AI Server Connection Failure

### Cause

The AI server is not running or the configured port is incorrect.

### Solution

Restart the AI server.

```powershell
cd C:\Users\User\Desktop\Cryptova\cryptova-ai
python -m uvicorn app:app --port 8001 --reload
```

Verify that the backend is configured to use:

```text
http://127.0.0.1:8001
```

---

# 12. Shutdown

Press the following keys in each PowerShell window:

```text
Ctrl + C
```

When the backend server stops, the scheduler will also terminate automatically.

---

# 13. Verification Checklist

The project is running successfully if all items below are confirmed:

* [ ] MySQL server is running
* [ ] Backend server is running on port 8000
* [ ] AI server is running on port 8001
* [ ] Frontend server is running on port 5173
* [ ] Registration or login succeeds
* [ ] Strategy settings are saved successfully
* [ ] Paper asset is displayed
* [ ] Run Once executes successfully
* [ ] Trading history is displayed
* [ ] Backtest results are displayed
