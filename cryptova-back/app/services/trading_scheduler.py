import os
from datetime import datetime

from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.strategy_setting import StrategySetting
from app.models.user import User
from app.routers.trading import TradingRunOnceRequest, run_trading_once

load_dotenv()

scheduler = BackgroundScheduler(timezone="UTC")


def run_auto_trading_job():
    """
    자동매매 스케줄러가 주기적으로 실행하는 함수.

    흐름:
    1. auto_trading_enabled=True인 전략 설정 조회
    2. 해당 user 조회
    3. /trading/run-once와 같은 로직 실행
    4. 결과는 trading_runs에 저장됨
    """

    db: Session = SessionLocal()

    try:
        enabled_settings = (
            db.query(StrategySetting)
            .filter(StrategySetting.auto_trading_enabled == True)
            .all()
        )

        if not enabled_settings:
            print("[AUTO_TRADING] No enabled strategies.")
            return

        for setting in enabled_settings:
            user = (
                db.query(User)
                .filter(User.id == setting.user_id)
                .first()
            )

            if user is None:
                print(
                    f"[AUTO_TRADING] User not found. "
                    f"user_id={setting.user_id}"
                )
                continue

            try:
                print(
                    f"[AUTO_TRADING] Run start. "
                    f"user_id={user.id}, symbol={setting.symbol}, "
                    f"time={datetime.utcnow()}"
                )

                result = run_trading_once(
                    request=TradingRunOnceRequest(
                        symbol=setting.symbol,
                        dry_run=False,
                    ),
                    db=db,
                    current_user=user,
                )

                print(
                    f"[AUTO_TRADING] Run completed. "
                    f"user_id={user.id}, action={result.action}, "
                    f"message={result.message}"
                )

            except Exception as e:
                print(
                    f"[AUTO_TRADING] Run failed. "
                    f"user_id={setting.user_id}, error={str(e)}"
                )

    finally:
        db.close()


def start_scheduler():
    if scheduler.running:
        print("[AUTO_TRADING] Scheduler already running.")
        return

    interval_minutes = int(
        os.getenv("AUTO_TRADING_INTERVAL_MINUTES", "60")
    )

    scheduler.add_job(
        run_auto_trading_job,
        trigger="interval",
        minutes=interval_minutes,
        id="auto_trading_job",
        replace_existing=True,
    )

    scheduler.start()

    print(
        f"[AUTO_TRADING] Scheduler started. "
        f"interval={interval_minutes} minutes"
    )


def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        print("[AUTO_TRADING] Scheduler stopped.")