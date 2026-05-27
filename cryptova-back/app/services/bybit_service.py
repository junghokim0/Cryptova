from pybit.unified_trading import HTTP


class BybitService:
    def __init__(self, api_key: str, api_secret: str, is_testnet: bool = True):
        self.session = HTTP(
            testnet=is_testnet,
            api_key=api_key,
            api_secret=api_secret,
        )

    def get_usdt_balance(self) -> dict:
        response = self.session.get_wallet_balance(
            accountType="UNIFIED",
            coin="USDT",
        )

        if response.get("retCode") != 0:
            raise Exception(response.get("retMsg", "Failed to fetch Bybit balance"))

        account_list = response.get("result", {}).get("list", [])

        if not account_list:
            return {
                "wallet_balance": 0.0,
                "available_balance": 0.0,
                "unrealized_pnl": 0.0,
                "used_margin": 0.0,
                "coin": "USDT",
            }

        account = account_list[0]
        coins = account.get("coin", [])
        usdt = next((item for item in coins if item.get("coin") == "USDT"), None)

        if not usdt:
            return {
                "wallet_balance": 0.0,
                "available_balance": 0.0,
                "unrealized_pnl": 0.0,
                "used_margin": 0.0,
                "coin": "USDT",
            }

        wallet_balance = float(usdt.get("walletBalance") or 0)

        account_available = float(account.get("totalAvailableBalance") or 0)
        coin_available = float(usdt.get("availableToWithdraw") or 0)

        available_balance = account_available if account_available > 0 else coin_available

        if available_balance <= 0 and wallet_balance > 0:
            available_balance = wallet_balance

        unrealized_pnl = float(usdt.get("unrealisedPnl") or 0)
        used_margin = max(wallet_balance - available_balance, 0)

        return {
            "wallet_balance": wallet_balance,
            "available_balance": available_balance,
            "unrealized_pnl": unrealized_pnl,
            "used_margin": used_margin,
            "coin": "USDT",
        }
    def get_position(self, symbol: str = "BTCUSDT"):
        response = self.session.get_positions(
            category="linear",
            symbol=symbol,
        )

        if response.get("retCode") != 0:
            raise Exception(response.get("retMsg", "Failed to fetch Bybit position."))

        positions = response.get("result", {}).get("list", [])

        if not positions:
            return {
                "symbol": symbol,
                "side": "None",
                "size": 0.0,
                "entry_price": 0.0,
                "leverage": 0.0,
                "unrealised_pnl": 0.0,
            }

        pos = positions[0]

        size = float(pos.get("size") or 0)

        if size == 0:
            side = "None"
        else:
            side = pos.get("side") or "None"

        return {
            "symbol": pos.get("symbol", symbol),
            "side": side,
            "size": size,
            "entry_price": float(pos.get("avgPrice") or 0),
            "leverage": float(pos.get("leverage") or 0),
            "unrealised_pnl": float(pos.get("unrealisedPnl") or 0),
        }
    def get_ticker_price(self, symbol: str = "BTCUSDT") -> float:
        response = self.session.get_tickers(
            category="linear",
            symbol=symbol,
        )

        if response.get("retCode") != 0:
            raise Exception(response.get("retMsg", "Failed to fetch ticker price."))

        ticker_list = response.get("result", {}).get("list", [])

        if not ticker_list:
            raise Exception("Ticker price not found.")

        return float(ticker_list[0].get("lastPrice") or 0)


    def calculate_order_quantity(
        self,
        balance: float,
        position_size: float,
        leverage: float,
        current_price: float,
    ) -> dict:
        if balance <= 0:
            raise Exception("Balance must be greater than 0.")

        if position_size <= 0:
            raise Exception("Position size must be greater than 0.")

        if leverage <= 0:
            raise Exception("Leverage must be greater than 0.")

        if current_price <= 0:
            raise Exception("Current price must be greater than 0.")

        order_value = balance * position_size * leverage
        qty = order_value / current_price

        # Bybit BTCUSDT qty precision을 고려해서 우선 3자리 반올림
        qty = round(qty, 3)

        return {
            "balance": float(balance),
            "position_size": float(position_size),
            "leverage": float(leverage),
            "current_price": float(current_price),
            "order_value": float(order_value),
            "qty": float(qty),
        }
    def place_market_order(
        self,
        symbol: str,
        side: str,
        qty: float,
        reduce_only: bool = False,
    ) -> dict:
        """
        side: "Buy" 또는 "Sell"
        reduce_only: 청산 주문이면 True, 신규 진입이면 False
        """

        if side not in ["Buy", "Sell"]:
            raise Exception("side must be Buy or Sell.")

        if qty <= 0:
            raise Exception("qty must be greater than 0.")

        response = self.session.place_order(
            category="linear",
            symbol=symbol,
            side=side,
            orderType="Market",
            qty=str(qty),
            reduceOnly=reduce_only,
        )

        if response.get("retCode") != 0:
            raise Exception(response.get("retMsg", "Failed to place Bybit order."))

        result = response.get("result", {})

        return {
            "order_id": result.get("orderId"),
            "order_link_id": result.get("orderLinkId"),
            "symbol": symbol,
            "side": side,
            "qty": qty,
            "reduce_only": reduce_only,
            "raw_response": response,
        }

    def close_position_market(self, symbol: str = "BTCUSDT") -> dict:
        position = self.get_position(symbol=symbol)

        size = float(position.get("size") or 0)
        side = position.get("side")

        if size <= 0 or side == "None":
            return {
                "closed": False,
                "message": "No open position to close.",
                "symbol": symbol,
                "size": 0.0,
            }

        close_side = "Sell" if side == "Buy" else "Buy"

        order_result = self.place_market_order(
            symbol=symbol,
            side=close_side,
            qty=size,
            reduce_only=True,
        )

        return {
            "closed": True,
            "message": "Position close order submitted.",
            **order_result,
        }