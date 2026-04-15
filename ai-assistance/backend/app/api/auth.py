"""
Auth routes: register, login, get current user.
"""
import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.middleware import generate_api_key, get_current_user
from app.core.security import create_access_token, hash_api_key, hash_password, verify_password
from app.db.database import get_db
from app.db.models import ApiKey, User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.execute(select(User).where(User.email == body.email)).scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        customer_id=str(_uuid.uuid4()),
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role="basic",
        status="active",
    )
    db.add(user)
    db.flush()  # get user.id before commit

    # Auto-create first API key
    raw_key = generate_api_key()
    api_key = ApiKey(
        user_id=user.id,
        key_prefix=raw_key[:12],
        key_hash=hash_api_key(raw_key),
        label="Default",
    )
    db.add(api_key)
    db.commit()
    db.refresh(user)

    return {
        "customer_id": user.customer_id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        # Raw key returned ONCE — never stored in plaintext
        "api_key": raw_key,
        "api_key_label": "Default",
        "warning": "Save your API key now. It will not be shown again.",
    }


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == body.email)).scalars().first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.status == "suspended":
        raise HTTPException(status_code=403, detail="Account suspended")

    token = create_access_token(subject=user.id, role=user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "customer_id": user.customer_id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "status": user.status,
        },
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "customer_id": current_user.customer_id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "status": current_user.status,
        "created_at": current_user.created_at,
    }
