"""
Admin routes. All endpoints require JWT + admin role.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.middleware import require_admin
from app.db.database import get_db
from app.db.models import ApiKey, ChatSession, Payment, Plan, Subscription, UsageDaily, User

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.execute(select(User).order_by(User.created_at.desc())).scalars().all()
    return [
        {
            "id": u.id,
            "customer_id": u.customer_id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "created_at": u.created_at,
        }
        for u in users
    ]


class PatchUserRequest(BaseModel):
    status: str | None = None   # active / suspended
    role: str | None = None     # admin / basic / pro / ultra


@router.patch("/users/{user_id}")
def patch_user(
    user_id: int,
    body: PatchUserRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.status:
        allowed = {"active", "suspended"}
        if body.status not in allowed:
            raise HTTPException(status_code=400, detail=f"status must be one of {allowed}")
        user.status = body.status
    if body.role:
        allowed_roles = {"admin", "basic", "pro", "ultra"}
        if body.role not in allowed_roles:
            raise HTTPException(status_code=400, detail=f"role must be one of {allowed_roles}")
        user.role = body.role
    db.commit()
    return {"id": user.id, "status": user.status, "role": user.role}


# ── Payments ──────────────────────────────────────────────────────────────────

@router.get("/payments")
def list_payments(
    status: str | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = select(Payment).order_by(Payment.created_at.desc())
    if status:
        q = q.where(Payment.status == status)
    payments = db.execute(q).scalars().all()
    return [
        {
            "id": p.id,
            "user": {"id": p.user.id, "name": p.user.name, "email": p.user.email},
            "plan": p.plan.name,
            "status": p.status,
            "receipt_path": p.receipt_path,
            "notes": p.notes,
            "created_at": p.created_at,
            "reviewed_at": p.reviewed_at,
        }
        for p in payments
    ]


class ReviewPaymentRequest(BaseModel):
    notes: str | None = None


@router.patch("/payments/{payment_id}/approve")
def approve_payment(
    payment_id: int,
    body: ReviewPaymentRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    payment = db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = "approved"
    payment.reviewed_by = admin.id
    payment.reviewed_at = datetime.utcnow()
    payment.notes = body.notes

    # Activate subscription (30 days)
    sub = Subscription(
        user_id=payment.user_id,
        plan_id=payment.plan_id,
        status="active",
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(sub)

    # Update user role to match plan name
    user = db.get(User, payment.user_id)
    if user:
        user.role = payment.plan.name  # plan name = basic/pro/ultra

    db.commit()
    return {"message": "Payment approved, subscription activated"}


@router.patch("/payments/{payment_id}/reject")
def reject_payment(
    payment_id: int,
    body: ReviewPaymentRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    payment = db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = "rejected"
    payment.reviewed_by = admin.id
    payment.reviewed_at = datetime.utcnow()
    payment.notes = body.notes
    db.commit()
    return {"message": "Payment rejected"}


# ── Usage ─────────────────────────────────────────────────────────────────────

@router.get("/usage")
def usage_stats(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(UsageDaily).order_by(UsageDaily.date.desc()).limit(500)
    ).scalars().all()
    # Group by user via api_key
    by_user: dict[int, dict] = {}
    for row in rows:
        uid = row.api_key.user_id
        if uid not in by_user:
            u = row.api_key.user
            by_user[uid] = {"user_id": uid, "name": u.name, "email": u.email, "total": 0, "daily": []}
        by_user[uid]["total"] += row.count
        by_user[uid]["daily"].append({"date": str(row.date), "count": row.count})
    return sorted(by_user.values(), key=lambda x: x["total"], reverse=True)


# ── Keys ──────────────────────────────────────────────────────────────────────

@router.get("/keys")
def list_all_keys(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    keys = db.execute(select(ApiKey).order_by(ApiKey.created_at.desc())).scalars().all()
    return [
        {
            "id": k.id,
            "user": {"id": k.user.id, "name": k.user.name, "email": k.user.email},
            "label": k.label,
            "key_prefix": k.key_prefix,
            "revoked": k.revoked,
            "last_used_at": k.last_used_at,
            "created_at": k.created_at,
        }
        for k in keys
    ]


@router.delete("/keys/{key_id}", status_code=204)
def revoke_any_key(
    key_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    key = db.get(ApiKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    key.revoked = True
    db.commit()


# ── Sessions (audit) ──────────────────────────────────────────────────────────

@router.get("/sessions")
def list_all_sessions(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sessions = db.execute(
        select(ChatSession).order_by(ChatSession.updated_at.desc()).limit(200)
    ).scalars().all()
    return [
        {
            "id": s.id,
            "user": {"id": s.user.id, "name": s.user.name, "email": s.user.email},
            "title": s.title,
            "message_count": len(s.messages),
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        }
        for s in sessions
    ]


# ── Plans ─────────────────────────────────────────────────────────────────────

class UpdatePlanRequest(BaseModel):
    request_limit: int | None = None
    price_usd: float | None = None


@router.put("/plans/{plan_id}")
def update_plan(
    plan_id: int,
    body: UpdatePlanRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if body.request_limit is not None:
        plan.request_limit = body.request_limit
    if body.price_usd is not None:
        plan.price_usd = body.price_usd
    db.commit()
    return {"id": plan.id, "name": plan.name, "request_limit": plan.request_limit, "price_usd": float(plan.price_usd)}
