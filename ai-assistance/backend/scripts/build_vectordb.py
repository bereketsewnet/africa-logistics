#!/usr/bin/env python3
"""
RAG Vector DB Builder
=====================
Walks every .md file under rag_data/, splits by ## headings, embeds with
fastembed (BAAI/bge-small-en-v1.5 ONNX), and upserts into the ChromaDB
collection  africa_logistics_kb.

Usage:
    python scripts/build_vectordb.py
    python scripts/build_vectordb.py --force   # re-embed everything
"""

import hashlib
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import chromadb
from fastembed import TextEmbedding

from app.core.config import settings

# ── Config ────────────────────────────────────────────────────────────────────

RAG_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "rag_data")
COLLECTION_NAME = settings.CHROMA_COLLECTION
CHUNK_MAX_CHARS = 2400          # ~600 tokens at ~4 chars/token
MODEL_NAME = "BAAI/bge-small-en-v1.5"

ROLE_MAP = {
    "admin":    "admin",
    "driver":   "driver",
    "shipper":  "shipper",
    "identity": "identity",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def detect_role(file_path: str) -> str:
    """Detect role from the first folder name after rag_data/."""
    rel = os.path.relpath(file_path, RAG_DATA_DIR)
    top_folder = rel.split(os.sep)[0].lower()
    return ROLE_MAP.get(top_folder, "identity")


def chunk_markdown(text: str, file_path: str, role: str) -> list[dict]:
    """
    Split markdown into chunks by ## headings.
    Each chunk includes the heading as its first line.
    Returns list of {id, text, metadata}.
    """
    chunks = []
    lines = text.splitlines()
    current_heading = os.path.basename(file_path)
    current_lines: list[str] = []

    def flush(heading: str, body_lines: list[str]):
        body = "\n".join(body_lines).strip()
        if not body:
            return
        # Hard split if chunk is very long
        chunk_text = f"## {heading}\n\n{body}"
        while len(chunk_text) > CHUNK_MAX_CHARS:
            split_at = chunk_text.rfind("\n", 0, CHUNK_MAX_CHARS)
            if split_at < 50:
                split_at = CHUNK_MAX_CHARS
            piece = chunk_text[:split_at]
            doc_id = hashlib.sha256(f"{file_path}::{heading}::{len(chunks)}".encode()).hexdigest()[:32]
            chunks.append({
                "id": doc_id,
                "text": piece,
                "metadata": {
                    "file_path": os.path.relpath(file_path, RAG_DATA_DIR),
                    "role": role,
                    "heading": heading,
                    "section": os.path.splitext(os.path.basename(file_path))[0],
                },
            })
            chunk_text = chunk_text[split_at:]
        if chunk_text.strip():
            doc_id = hashlib.sha256(f"{file_path}::{heading}::{len(chunks)}".encode()).hexdigest()[:32]
            chunks.append({
                "id": doc_id,
                "text": chunk_text,
                "metadata": {
                    "file_path": os.path.relpath(file_path, RAG_DATA_DIR),
                    "role": role,
                    "heading": heading,
                    "section": os.path.splitext(os.path.basename(file_path))[0],
                },
            })

    for line in lines:
        if line.startswith("## "):
            flush(current_heading, current_lines)
            current_heading = line[3:].strip()
            current_lines = []
        else:
            current_lines.append(line)
    flush(current_heading, current_lines)
    return chunks


def collect_all_chunks() -> list[dict]:
    all_chunks = []
    for root, _dirs, files in os.walk(RAG_DATA_DIR):
        for fname in sorted(files):
            if not fname.endswith(".md"):
                continue
            path = os.path.join(root, fname)
            role = detect_role(path)
            with open(path, encoding="utf-8") as f:
                text = f.read()
            file_chunks = chunk_markdown(text, path, role)
            all_chunks.extend(file_chunks)
            print(f"  {os.path.relpath(path, RAG_DATA_DIR):50s}  {len(file_chunks)} chunks  [{role}]")
    return all_chunks


# ── Main ──────────────────────────────────────────────────────────────────────

def main(force: bool = False):
    print(f"RAG Data dir : {RAG_DATA_DIR}")
    print(f"ChromaDB     : {settings.CHROMA_HOST}:{settings.CHROMA_PORT}")
    print(f"Collection   : {COLLECTION_NAME}")
    print(f"Model        : {MODEL_NAME}")
    print()

    if not os.path.isdir(RAG_DATA_DIR):
        print(f"ERROR: rag_data directory not found at {RAG_DATA_DIR}")
        sys.exit(1)

    # ── Connect to ChromaDB ───────────────────────────────────────────────────
    print("Connecting to ChromaDB …")
    client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=int(settings.CHROMA_PORT))
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    print(f"  Collection '{COLLECTION_NAME}' ready  (existing docs: {collection.count()})")

    # ── Load embedding model ──────────────────────────────────────────────────
    print(f"\nLoading embedding model '{MODEL_NAME}' …")
    model = TextEmbedding(model_name=MODEL_NAME)
    print("  Model loaded.")

    # ── Collect chunks ────────────────────────────────────────────────────────
    print("\nParsing markdown files …")
    chunks = collect_all_chunks()
    print(f"\nTotal chunks: {len(chunks)}")

    if not chunks:
        print("No chunks found — nothing to index.")
        return

    # ── Check which chunks already exist (skip if not force) ─────────────────
    if not force:
        existing_ids = set(collection.get(ids=[c["id"] for c in chunks])["ids"])
        chunks_to_upsert = [c for c in chunks if c["id"] not in existing_ids]
        print(f"Chunks to upsert: {len(chunks_to_upsert)}  (skipping {len(existing_ids)} unchanged)")
    else:
        chunks_to_upsert = chunks
        print(f"Force mode — upserting all {len(chunks_to_upsert)} chunks")

    if not chunks_to_upsert:
        print("Vector DB is up to date.")
        return

    # ── Embed and upsert in batches ───────────────────────────────────────────
    BATCH = 64
    total = len(chunks_to_upsert)
    print(f"\nEmbedding and upserting {total} chunks in batches of {BATCH} …")
    t0 = time.time()

    for i in range(0, total, BATCH):
        batch = chunks_to_upsert[i : i + BATCH]
        texts = [c["text"] for c in batch]
        embeddings = [e.tolist() for e in model.embed(texts)]
        collection.upsert(
            ids=[c["id"] for c in batch],
            documents=texts,
            embeddings=embeddings,
            metadatas=[c["metadata"] for c in batch],
        )
        done = min(i + BATCH, total)
        print(f"  [{done}/{total}] upserted")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.1f}s  — collection now has {collection.count()} docs.")


if __name__ == "__main__":
    force = "--force" in sys.argv
    main(force=force)
