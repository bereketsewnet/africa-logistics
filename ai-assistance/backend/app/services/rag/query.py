"""
RAG query service.
Connects to ChromaDB, embeds the user question, filters by role, and returns
the top-K most relevant chunks as context for the LLM.
"""
import logging
import os
from functools import lru_cache

import chromadb
from fastembed import TextEmbedding

from app.core.config import settings

logger = logging.getLogger("bemnet.rag")

MODEL_NAME = "BAAI/bge-small-en-v1.5"

# Role → folders to include in retrieval filter
ROLE_FILTERS: dict[str, list[str]] = {
    "admin":  ["admin", "identity"],
    "basic":  ["shipper", "identity"],   # basic users = shippers
    "pro":    ["shipper", "identity"],
    "ultra":  ["shipper", "identity"],
    "driver": ["driver", "identity"],
    "shipper": ["shipper", "identity"],
}


@lru_cache(maxsize=1)
def _get_model() -> TextEmbedding:
    logger.info("Loading embedding model '%s' …", MODEL_NAME)
    return TextEmbedding(model_name=MODEL_NAME)


@lru_cache(maxsize=1)
def _get_collection():
    client = chromadb.HttpClient(
        host=settings.CHROMA_HOST,
        port=int(settings.CHROMA_PORT),
    )
    return client.get_or_create_collection(
        name=settings.CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )


async def query_knowledge_base(
    question: str,
    user_role: str,
) -> list[dict]:
    """
    Returns a list of relevant chunks from the vector DB.
    Each chunk: { "source": str, "text": str, "score": float }
    """
    try:
        model = _get_model()
        collection = _get_collection()

        embedding = list(model.embed([question]))[0].tolist()

        role_folders = ROLE_FILTERS.get(user_role, ["identity"])

        # ChromaDB where filter: role must be in the allowed list
        if len(role_folders) == 1:
            where = {"role": role_folders[0]}
        else:
            where = {"role": {"$in": role_folders}}

        results = collection.query(
            query_embeddings=[embedding],
            n_results=settings.RAG_TOP_K,
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        chunks = []
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]

        for doc, meta, dist in zip(docs, metas, dists):
            score = 1.0 - dist  # cosine distance → similarity
            chunks.append({
                "source": meta.get("file_path", "unknown"),
                "heading": meta.get("heading", ""),
                "text": doc,
                "score": round(score, 4),
            })

        return chunks

    except Exception as exc:
        logger.warning("RAG query failed: %s — returning empty context", exc)
        return []
