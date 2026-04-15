"""
API Key management routes (JWT-authenticated).
Create, list, revoke keys. The raw key is only returned at creation time.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.middleware import generate_api_key, get_current_user
from app.core.security import hash_api_key
from app.db.database import get_db
from app.db.models import ApiKey, User

router = APIRouter(prefix="/api/keys", tags=["keys"])


class CreateKeyRequest(BaseModel):
    label: str = "New Key"


@router.get("")
def list_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = db.execute(
        select(ApiKey).where(ApiKey.user_id == user.id)
    ).scalars().all()
    return [
        {
            "id": k.id,
            "label": k.label,
            "key_prefix": k.key_prefix,
            "revoked": k.revoked,
            "last_used_at": k.last_used_at,
            "created_at": k.created_at,
        }
        for k in keys
    ]


@router.post("", status_code=201)
def create_key(
    body: CreateKeyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_key = generate_api_key()
    api_key = ApiKey(
        user_id=user.id,
        key_prefix=raw_key[:12],
        key_hash=hash_api_key(raw_key),
        label=body.label,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return {
        "id": api_key.id,
        "label": api_key.label,
        "key_prefix": api_key.key_prefix,
        # Raw key shown ONCE
        "api_key": raw_key,
        "warning": "Save your API key now. It will not be shown again.",
        "created_at": api_key.created_at,
    }


@router.delete("/{key_id}", status_code=204)
def revoke_key(
    key_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = db.get(ApiKey, key_id)
    if not key or key.user_id != user.id:
        raise HTTPException(status_code=404, detail="API key not found")
    key.revoked = True
    db.commit()
