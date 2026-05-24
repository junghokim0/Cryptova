import os

from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()


class EncryptionService:
    def __init__(self):
        key = os.getenv("ENCRYPTION_KEY")

        if not key:
            raise ValueError("ENCRYPTION_KEY is not set in .env")

        self.fernet = Fernet(key.encode())

    def encrypt(self, plain_text: str) -> str:
        return self.fernet.encrypt(plain_text.encode()).decode()

    def decrypt(self, encrypted_text: str) -> str:
        return self.fernet.decrypt(encrypted_text.encode()).decode()