from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://bemnet:bemnet@localhost:5432/bemnet"

    # ── LLM ──────────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

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


settings = Settings()


