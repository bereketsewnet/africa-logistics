FROM python:3.12-slim

WORKDIR /app

# System deps for psycopg2 and sentence-transformers
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Runtime directories
RUN mkdir -p uploads/receipts chroma_data

EXPOSE 8001

# Startup: migrate → seed → build vector DB → serve
CMD ["sh", "-c", "alembic upgrade head && python scripts/seed.py && python scripts/build_vectordb.py && uvicorn app.main:app --host 0.0.0.0 --port 8001"]
