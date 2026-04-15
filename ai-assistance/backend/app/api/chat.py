"""
Chat routes — AI ask endpoint + session management.
Uses API key authentication + quota middleware.
LLM and RAG logic is implemented in Phase 4; this wires the plumbing.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.middleware import get_api_key_user
from app.db.database import get_db
from app.db.models import ApiKey, ChatMessage, ChatSession, User
from app.services.llm.chat import stream_answer
from app.services.usage.counter import increment_usage

router = APIRouter(prefix="/api", tags=["chat"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str
    session_id: int | None = None


class CreateSessionRequest(BaseModel):
    title: str = "New Chat"


# ── Ask ───────────────────────────────────────────────────────────────────────

@router.post("/ask")
async def ask(
    body: AskRequest,
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
    db: Session = Depends(get_db),
):
    user, api_key = auth

    # Resolve or create session
    if body.session_id:
        session = db.get(ChatSession, body.session_id)
        if not session or session.user_id != user.id:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        # Auto-create session titled from first 60 chars of the question
        title = body.question[:60] + ("…" if len(body.question) > 60 else "")
        session = ChatSession(user_id=user.id, title=title)
        db.add(session)
        db.commit()
        db.refresh(session)

    # Save user message
    user_msg = ChatMessage(session_id=session.id, role="user", content=body.question)
    db.add(user_msg)
    db.commit()

    # History (last N messages before this one)
    history = db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(21)  # 10 pairs + current
    ).scalars().all()
    history = list(reversed(history))[:-1]  # exclude just-added user msg

    async def generate():
        full_response = ""
        prompt_tokens = 0
        completion_tokens = 0
        async for chunk, p_tok, c_tok in stream_answer(
            question=body.question,
            history=history,
            user_role=user.role,
        ):
            full_response += chunk
            prompt_tokens += p_tok
            completion_tokens += c_tok
            yield chunk

        # Persist assistant message and increment usage after stream ends
        assistant_msg = ChatMessage(
            session_id=session.id,
            role="assistant",
            content=full_response,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        db.add(assistant_msg)
        db.commit()
        increment_usage(api_key_id=api_key.id, db=db)

    return StreamingResponse(
        generate(),
        media_type="text/plain",
        headers={"X-Session-Id": str(session.id)},
    )


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/sessions")
def list_sessions(
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
    db: Session = Depends(get_db),
):
    user, _ = auth
    sessions = db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
    ).scalars().all()
    return [
        {"id": s.id, "title": s.title, "created_at": s.created_at, "updated_at": s.updated_at}
        for s in sessions
    ]


@router.post("/sessions", status_code=201)
def create_session(
    body: CreateSessionRequest,
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
    db: Session = Depends(get_db),
):
    user, _ = auth
    session = ChatSession(user_id=user.id, title=body.title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "title": session.title, "created_at": session.created_at}


@router.get("/sessions/{session_id}")
def get_session(
    session_id: int,
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
    db: Session = Depends(get_db),
):
    user, _ = auth
    session = db.get(ChatSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at,
            }
            for m in session.messages
        ],
    }


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
    db: Session = Depends(get_db),
):
    user, _ = auth
    session = db.get(ChatSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
