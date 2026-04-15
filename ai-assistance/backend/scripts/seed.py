"""
Seed default plans and a super-admin user.
Run once after `alembic upgrade head`:

    python scripts/seed.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.middleware import generate_api_key
from app.core.security import hash_api_key, hash_password
from app.db.database import SessionLocal, engine
from app.db.models import ApiKey, Base, Plan, User


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # ── Plans ──────────────────────────────────────────────────────────
        plans = [
            {"name": "basic", "request_limit": 500,  "price_usd": 0.00},
            {"name": "pro",   "request_limit": 700,  "price_usd": 9.99},
            {"name": "ultra", "request_limit": 0,    "price_usd": 29.99},  # 0 = unlimited
        ]
        for p in plans:
            existing = db.query(Plan).filter_by(name=p["name"]).first()
            if not existing:
                db.add(Plan(**p))
                print(f"  [+] Plan '{p['name']}' created")
            else:
                print(f"  [ ] Plan '{p['name']}' already exists")

        db.commit()

        # ── Admin User ──────────────────────────────────────────────────────
        admin_email = os.getenv("ADMIN_EMAIL", "admin@bemnet.ai")
        admin_pass  = os.getenv("ADMIN_PASSWORD", "change-me-now!")

        existing_admin = db.query(User).filter_by(email=admin_email).first()
        if not existing_admin:
            admin = User(
                name="Super Admin",
                email=admin_email,
                password_hash=hash_password(admin_pass),
                role="admin",
                status="active",
            )
            db.add(admin)
            db.flush()

            raw_key = generate_api_key()
            db.add(ApiKey(
                user_id=admin.id,
                key_prefix=raw_key[:12],
                key_hash=hash_api_key(raw_key),
                label="Admin Default",
            ))
            db.commit()
            print(f"  [+] Admin user created → {admin_email}")
            print(f"  [!] Admin API key (save now): {raw_key}")
            print(f"  [!] Admin password: {admin_pass}")
        else:
            print(f"  [ ] Admin user '{admin_email}' already exists")

    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding database …")
    seed()
    print("Done.")
