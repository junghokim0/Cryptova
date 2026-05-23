import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Cryptova")
    APP_ENV: str = os.getenv("APP_ENV", "local")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-this-secret-key")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
    )


settings = Settings()