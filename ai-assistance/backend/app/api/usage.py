"""
Usage stats routes (JWT-authenticated).
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.middleware import get_current_user, _get_plan_limit
from app.db.database import get_db
from app.db.models import ApiKey, UsageDaily, User

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("")
def get_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Gather all key IDs for this user
    keys = db.execute(select(ApiKey).where(ApiKey.user_id == user.id)).scalars().all()
    key_ids = [k.id for k in keys]

    today = date.today()
    thirty_days_ago = today - timedelta(days=30)

    # Daily breakdown for the last 30 days (all keys combined)
    daily_rows = []
    if key_ids:
        rows = db.execute(
            select(UsageDaily)
            .where(
                UsageDaily.api_key_id.in_(key_ids),
                UsageDaily.date >= thirty_days_ago,
            )
            .order_by(UsageDaily.date)
        ).scalars().all()

        # Aggregate by date
        by_date: dict[date, int] = {}
        for row in rows:
            by_date[row.date] = by_date.get(row.date, 0) + row.count
        daily_rows = [{"date": str(d), "count": c} for d, c in sorted(by_date.items())]

    today_count = sum(
        r["count"] for r in daily_rows if r["date"] == str(today)
    )

    limit = _get_plan_limit(user, db)

    return {
        "today": {
            "used": today_count,
            "limit": limit,
            "unlimited": limit == 0,
        },
        "daily": daily_rows,
        "role": user.role,
    }
