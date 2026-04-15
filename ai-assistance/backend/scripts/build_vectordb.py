#!/usr/bin/env python3
"""
RAG Vector DB Builder
=====================
Walks every .md file under rag_data/, splits by ## headings, embeds with
sentence-transformers/all-MiniLM-L6-v2, and upserts into the ChromaDB
collection defined in app/core/config.py.

Implemented in Phase 3.
Usage:
    python scripts/build_vectordb.py
    python scripts/build_vectordb.py --force   # re-embed everything
"""

import sys

if __name__ == "__main__":
    print("build_vectordb.py: Phase 3 implementation pending.")
    sys.exit(0)
