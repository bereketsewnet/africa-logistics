from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List


class Settings(BaseSettings):
    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://bemnet:bemnet@localhost:5432/bemnet"

    # ── LLM ──────────────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # ── Security ─────────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # ── ChromaDB ─────────────────────────────────────────────────────────────
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8000
    CHROMA_PATH: str = "./chroma_data"
    CHROMA_COLLECTION: str = "africa_logistics_kb"

    # ── File uploads ─────────────────────────────────────────────────────────
    RECEIPT_UPLOAD_PATH: str = "uploads/receipts"

    # ── RAG / Chat ───────────────────────────────────────────────────────────
    RAG_TOP_K: int = 5
    HISTORY_WINDOW: int = 10

    # ── CORS ─────────────────────────────────────────────────────────────────
    # In .env use JSON array: CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @model_validator(mode="after")
    def validate_security_settings(self):
        weak_defaults = {
            "change-me-in-production",
            "change-me-to-a-random-64-char-hex-string",
            "secret",
            "password",
        }
        if self.SECRET_KEY in weak_defaults or len(self.SECRET_KEY) < 32:
            raise ValueError(
                "SECRET_KEY is weak. Use a random value with at least 32 characters."
            )
        return self


settings = Settings()


