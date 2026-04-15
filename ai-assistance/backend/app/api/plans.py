"""
Plans listing and payment/receipt upload routes.
"""
import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.middleware import get_current_user
from app.db.database import get_db
from app.db.models import Payment, Plan, User

router = APIRouter(tags=["plans"])

ALLOWED_RECEIPT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/plans")
def list_plans(db: Session = Depends(get_db)):
    plans = db.execute(select(Plan).order_by(Plan.price_usd)).scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "request_limit": p.request_limit,
            "price_usd": float(p.price_usd),
            "unlimited": p.request_limit == 0,
        }
        for p in plans
    ]


@router.post("/payments/upload", status_code=201)
async def upload_payment(
    plan_id: int = Form(...),
    receipt: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate plan exists
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Validate file type
    if receipt.content_type not in ALLOWED_RECEIPT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, WebP, PDF")

    # Read and size-check
    contents = await receipt.read()
    if len(contents) > MAX_RECEIPT_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    # Save file with UUID filename to prevent path traversal
    ext = os.path.splitext(receipt.filename or "receipt")[1].lower() or ".bin"
    filename = f"{uuid.uuid4()}{ext}"
    upload_dir = settings.RECEIPT_UPLOAD_PATH
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, filename)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    payment = Payment(
        user_id=user.id,
        plan_id=plan_id,
        receipt_path=file_path,
        status="pending",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return {
        "id": payment.id,
        "plan": plan.name,
        "status": payment.status,
        "created_at": payment.created_at,
        "message": "Payment receipt submitted. Admin will review within 24 hours.",
    }


@router.get("/payments/my")
def my_payments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payments = db.execute(
        select(Payment).where(Payment.user_id == user.id).order_by(Payment.created_at.desc())
    ).scalars().all()
    return [
        {
            "id": p.id,
            "plan": p.plan.name,
            "status": p.status,
            "notes": p.notes,
            "created_at": p.created_at,
            "reviewed_at": p.reviewed_at,
        }
        for p in payments
    ]
