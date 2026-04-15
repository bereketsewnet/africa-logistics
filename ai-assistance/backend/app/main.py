import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.api import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("bemnet")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup / shutdown hooks."""
    logger.info("Bemnet AI Assistance API starting up …")
    logger.info("  DB           → %s", settings.DATABASE_URL.split("@")[-1])
    logger.info("  ChromaDB     → %s:%s", settings.CHROMA_HOST, settings.CHROMA_PORT)
    logger.info("  CORS origins → %s", settings.CORS_ORIGINS)
    # Ensure upload directory exists
    os.makedirs(settings.RECEIPT_UPLOAD_PATH, exist_ok=True)
    # Phase 3 — ChromaDB warm-up will go here
    yield
    logger.info("Bemnet AI Assistance API shutting down.")


app = FastAPI(
    title="Bemnet AI Assistance API",
    description="AI-powered logistics assistant backed by a RAG knowledge base.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all API routes
app.include_router(api_router)


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "service": "bemnet-ai", "version": "1.0.0"}


@app.get("/", tags=["system"])
async def root():
    return {
        "service": "Bemnet AI Assistance API",
        "docs": "/docs",
        "health": "/health",
    }

