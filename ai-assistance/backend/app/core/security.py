"""
JWT creation/verification and password hashing utilities.
"""
from datetime import datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── API Keys ──────────────────────────────────────────────────────────────────

def hash_api_key(key: str) -> str:
    """Store a bcrypt hash of the raw API key — never store the raw key."""
    return pwd_context.hash(key)


def verify_api_key(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(subject: int, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(subject),
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Returns the decoded payload or raises JWTError.
    Callers should catch JWTError and translate to HTTP 401.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
