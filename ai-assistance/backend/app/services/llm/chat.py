"""
LLM chat service.
Phase 4 will wire this to OpenAI with real RAG context injection.
For Phase 1 the function signature and async generator contract are
defined so the chat route can import and stream without errors.
"""
from typing import AsyncGenerator

from app.db.models import ChatMessage
from app.services.rag.query import query_knowledge_base


async def stream_answer(
    question: str,
    history: list[ChatMessage],
    user_role: str,
) -> AsyncGenerator[tuple[str, int, int], None]:
    """
    Yields (chunk: str, prompt_tokens: int, completion_tokens: int) tuples.
    The chat route accumulates chunks into the full response string.

    Phase 1: returns a placeholder message so the endpoint is testable.
    Phase 4: replaced with real OpenAI streaming + RAG context.
    """
    # Retrieve RAG context (empty in Phase 1, real in Phase 3+)
    _chunks = await query_knowledge_base(question, user_role)

    placeholder = (
        "The AI assistant is not yet connected to the language model. "
        "This will be fully functional after Phase 4 implementation."
    )
    for token in placeholder.split(" "):
        yield token + " ", 0, 0
