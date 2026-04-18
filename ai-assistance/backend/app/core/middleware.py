"""
FastAPI dependencies for authentication and quota enforcement.

Two auth paths:
  - JWT bearer  → get_current_user()   used by key-management, usage, admin routes
  - API key     → get_api_key_user()   used by /api/ask and session routes
"""
import secrets
from datetime import date
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token, verify_api_key
from app.db.database import get_db
from app.db.models import ApiKey, Subscription, UsageDaily, User


# ── JWT dependency ────────────────────────────────────────────────────────────

async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization or not authorization.startswith("Bearer "):
        raise credentials_exc
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
        user_id: int = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_exc

    user = db.get(User, user_id)
    if not user or user.status == "suspended":
        raise credentials_exc
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


# ── API Key dependency ────────────────────────────────────────────────────────

def _get_plan_limit(user: User, db: Session) -> int:
    """Return user's daily request limit from their active subscription, or role default."""
    if user.role == "admin":
        return 500
    sub = (
        db.execute(
            select(Subscription)
            .where(Subscription.user_id == user.id, Subscription.status == "active")
            .order_by(Subscription.expires_at.desc())
        )
        .scalars()
        .first()
    )
    if sub:
        return sub.plan.request_limit  # 0 = unlimited
    # No active subscription — fall back to the basic plan's limit from DB
    from app.db.models import Plan
    basic = db.execute(select(Plan).where(Plan.name == "basic")).scalars().first()
    return basic.request_limit if basic else 500


def _get_today_usage(api_key_id: int, db: Session) -> int:
    row = db.execute(
        select(UsageDaily).where(
            UsageDaily.api_key_id == api_key_id,
            UsageDaily.date == date.today(),
        )
    ).scalars().first()
    return row.count if row else 0


async def get_api_key_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> tuple[User, ApiKey]:
    """
    Validates the raw API key from Authorization: Bearer <key>.
    Enforces quota. Returns (user, api_key) tuple.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="API key required")

    raw_key = authorization.split(" ", 1)[1].strip()

    # Find candidate keys by prefix (first 12 chars) to limit bcrypt comparisons
    prefix = raw_key[:12]
    candidates: list[ApiKey] = (
        db.execute(
            select(ApiKey).where(ApiKey.key_prefix == prefix, ApiKey.revoked == False)
        )
        .scalars()
        .all()
    )

    matched: Optional[ApiKey] = None
    for candidate in candidates:
        if verify_api_key(raw_key, candidate.key_hash):
            matched = candidate
            break

    if not matched:
        raise HTTPException(status_code=401, detail="Invalid API key")

    user = matched.user
    if user.status == "suspended":
        raise HTTPException(status_code=403, detail="Account suspended")

    # Quota check
    limit = _get_plan_limit(user, db)
    if limit != 0:  # 0 = unlimited
        used = _get_today_usage(matched.id, db)
        if used >= limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "quota_exceeded",
                    "used": used,
                    "limit": limit,
                    "message": f"Daily limit of {limit} requests reached. Upgrade your plan.",
                },
            )

    return user, matched


# ── API Key generation ────────────────────────────────────────────────────────

def generate_api_key() -> str:
    """Generate a new raw API key of the form  bemnet_live_<32 random hex chars>."""
    return f"bemnet_live_{secrets.token_hex(16)}"
