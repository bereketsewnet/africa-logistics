"""
Usage counter service.
Increments the usage_daily row for a given api_key_id on today's date.
Uses an upsert pattern so no row is required to exist beforehand.
"""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import UsageDaily


def increment_usage(api_key_id: int, db: Session) -> None:
    today = date.today()
    row = db.execute(
        select(UsageDaily).where(
            UsageDaily.api_key_id == api_key_id,
            UsageDaily.date == today,
        )
    ).scalars().first()

    if row:
        row.count += 1
    else:
        db.add(UsageDaily(api_key_id=api_key_id, date=today, count=1))

    db.commit()
