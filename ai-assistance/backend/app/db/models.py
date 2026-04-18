import uuid
from datetime import datetime, date

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


def _now():
    return datetime.utcnow()


def _uuid():
    return str(uuid.uuid4())


# ── Plans ─────────────────────────────────────────────────────────────────────

class Plan(Base):
    __tablename__ = "plans"

    id            = Column(Integer, primary_key=True)
    name          = Column(String(50), nullable=False, unique=True)   # basic / pro / ultra
    request_limit = Column(Integer, nullable=False)                    # 0 = unlimited
    price_usd     = Column(Numeric(10, 2), nullable=False, default=0)

    subscriptions = relationship("Subscription", back_populates="plan")
    payments      = relationship("Payment", back_populates="plan")


# ── Users ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True)
    customer_id   = Column(String(36), unique=True, nullable=False, default=_uuid)
    name          = Column(String(120), nullable=False)
    email         = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(20), nullable=False, default="basic")  # admin/basic/pro/ultra
    status        = Column(String(20), nullable=False, default="active") # active/suspended
    created_at    = Column(DateTime, nullable=False, default=_now)
    updated_at    = Column(DateTime, nullable=False, default=_now, onupdate=_now)

    api_keys      = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    payments      = relationship("Payment", back_populates="user", foreign_keys="Payment.user_id", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")


# ── API Keys ──────────────────────────────────────────────────────────────────

class ApiKey(Base):
    __tablename__ = "api_keys"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key_prefix   = Column(String(16), nullable=False)   # first 12 chars — displayed in UI
    key_hash     = Column(String(255), nullable=False)  # bcrypt hash of full key — never returned
    label        = Column(String(100), nullable=False, default="Default")
    revoked      = Column(Boolean, nullable=False, default=False)
    last_used_at = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, nullable=False, default=_now)

    user        = relationship("User", back_populates="api_keys")
    usage_daily = relationship("UsageDaily", back_populates="api_key", cascade="all, delete-orphan")


# ── Subscriptions ─────────────────────────────────────────────────────────────

class Subscription(Base):
    __tablename__ = "subscriptions"

    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_id    = Column(Integer, ForeignKey("plans.id"), nullable=False)
    status     = Column(String(30), nullable=False, default="active")  # pending_payment/active/expired
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)

    user = relationship("User", back_populates="subscriptions")
    plan = relationship("Plan", back_populates="subscriptions")


# ── Payments ──────────────────────────────────────────────────────────────────

class Payment(Base):
    __tablename__ = "payments"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_id      = Column(Integer, ForeignKey("plans.id"), nullable=False)
    receipt_path = Column(String(500), nullable=False)
    status       = Column(String(20), nullable=False, default="pending")  # pending/approved/rejected
    reviewed_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at  = Column(DateTime, nullable=True)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, nullable=False, default=_now)

    user     = relationship("User", back_populates="payments", foreign_keys=[user_id])
    plan     = relationship("Plan", back_populates="payments")
    reviewer = relationship("User", foreign_keys=[reviewed_by])

class UsageDaily(Base):
    __tablename__ = "usage_daily"
    __table_args__ = (UniqueConstraint("api_key_id", "date", name="uq_usage_key_date"),)

    id         = Column(Integer, primary_key=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False)
    date       = Column(Date, nullable=False, default=date.today)
    count      = Column(Integer, nullable=False, default=0)

    api_key = relationship("ApiKey", back_populates="usage_daily")


# ── Chat Sessions ─────────────────────────────────────────────────────────────

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = Column(String(255), nullable=False, default="New Chat")
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)

    user     = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan",
                            order_by="ChatMessage.created_at")


# ── Chat Messages ─────────────────────────────────────────────────────────────

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id                = Column(Integer, primary_key=True)
    session_id        = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role              = Column(String(20), nullable=False)   # user / assistant
    content           = Column(Text, nullable=False)
    prompt_tokens     = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    created_at        = Column(DateTime, nullable=False, default=_now)

    session = relationship("ChatSession", back_populates="messages")

