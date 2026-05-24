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
        available_balance = float(usdt.get("availableToWithdraw") or 0)
        unrealized_pnl = float(usdt.get("unrealisedPnl") or 0)
        used_margin = max(wallet_balance - available_balance, 0)

        return {
            "wallet_balance": wallet_balance,
            "available_balance": available_balance,
            "unrealized_pnl": unrealized_pnl,
            "used_margin": used_margin,
            "coin": "USDT",
        }