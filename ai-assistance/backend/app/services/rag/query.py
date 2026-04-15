"""
RAG query service.
Phase 3 will replace the stub with real ChromaDB + embedding queries.
For Phase 1 the function signature and return contract are defined so
the LLM service and chat route can import it without errors.
"""
from typing import AsyncGenerator


ROLE_FOLDERS = {
    "admin": ["admin", "identity"],
    "basic": ["shipper", "identity"],    # basic = shipper context
    "pro":   ["shipper", "identity"],
    "ultra": ["shipper", "identity"],
    "driver": ["driver", "identity"],
}


async def query_knowledge_base(
    question: str,
    user_role: str,
) -> list[dict]:
    """
    Returns a list of relevant chunks from the vector DB.
    Each chunk: { "source": str, "text": str, "score": float }

    Phase 1: returns an empty list (no ChromaDB yet).
    Phase 3: replaced with real embedding + ChromaDB query.
    """
    _ = user_role  # will be used in Phase 3 for role-scoped filtering
    return []
