"""
LLM chat service — Gemini backend (google-genai SDK).
Builds a prompt from identity doc + RAG context + chat history,
then streams the Gemini response back as (chunk, prompt_tokens, completion_tokens) tuples.
"""
import logging
import os
from typing import AsyncGenerator

from google import genai
from google.genai import types

from app.core.config import settings
from app.db.models import ChatMessage
from app.services.rag.query import query_knowledge_base

logger = logging.getLogger("bemnet.llm")

# ── Load identity system prompt ───────────────────────────────────────────────

_IDENTITY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "rag_data", "identity", "who_am_i.md",
)


def _load_identity() -> str:
    try:
        with open(_IDENTITY_PATH, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        logger.warning("identity/who_am_i.md not found — using fallback system prompt")
        return (
            "You are Bemnet, the AI assistant for Afri logistics. "
            "Help users navigate the platform clearly and politely."
        )


_SYSTEM_PROMPT = _load_identity()


# ── Main streaming function ───────────────────────────────────────────────────

async def stream_answer(
    question: str,
    history: list[ChatMessage],
    user_role: str,
) -> AsyncGenerator[tuple[str, int, int], None]:
    """
    Yields (chunk: str, prompt_tokens: int, completion_tokens: int) tuples.
    Only the final tuple has non-zero token counts.
    """
    # 1. Retrieve RAG context
    rag_chunks = await query_knowledge_base(question, user_role)

    # 2. Build context block
    context_block = ""
    if rag_chunks:
        parts = []
        for c in rag_chunks:
            header = f"Source: {c['source']}"
            if c.get("heading"):
                header += f" / § {c['heading']}"
            parts.append(f"{header}\n{c['text']}")
        context_block = "\n\n---\n\n".join(parts)

    # 3. Build system instruction with optional RAG context
    system_content = _SYSTEM_PROMPT
    if context_block:
        system_content += (
            "\n\n---\n\n"
            "## Relevant Knowledge Base Context\n\n"
            "Use the following information to answer the user's question. "
            "If the context doesn't cover the question, use your best judgement "
            "while staying within your role boundaries.\n\n"
            + context_block
        )

    # 4. Build Gemini contents list (role: "user" | "model")
    contents: list[types.Content] = []
    window = history[-settings.HISTORY_WINDOW:] if history else []
    for msg in window:
        contents.append(types.Content(
            role="user" if msg.role == "user" else "model",
            parts=[types.Part(text=msg.content)],
        ))
    # Current user question
    contents.append(types.Content(
        role="user",
        parts=[types.Part(text=question)],
    ))

    # 5. Stream from Gemini
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    prompt_tokens = 0
    completion_tokens = 0

    try:
        stream = await client.aio.models.generate_content_stream(
            model=settings.GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_content,
                temperature=0.4,
                max_output_tokens=1024,
            ),
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text, 0, 0
            # Capture usage from final chunk
            if chunk.usage_metadata:
                prompt_tokens = chunk.usage_metadata.prompt_token_count or 0
                completion_tokens = chunk.usage_metadata.candidates_token_count or 0

        yield "", prompt_tokens, completion_tokens

    except Exception as exc:
        logger.error("Gemini streaming error: %s", exc)
        yield (
            "I'm sorry, I encountered an error processing your request. "
            "Please try again shortly.",
            0, 0,
        )
        yield "", 0, 0
