# AI Assistance System — Implementation Plan

## Architecture Overview

```
ai-assistance/
├── backend/          ← Python + FastAPI
│   ├── app/
│   │   ├── api/       routes
│   │   ├── core/      config, security, middleware
│   │   ├── db/        models, migrations
│   │   ├── services/
│   │   │   ├── rag/   vector DB + embedding + query
│   │   │   ├── llm/   LLM integration
│   │   │   └── usage/ request counting
│   │   └── rag_data/  ← copy of ai-assistance-rag-data/
│   ├── scripts/       build_vectordb.py
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/         ← React + Vite + TypeScript
    ├── src/
    │   ├── pages/     Landing, Register, Login, Dashboard, Plans, Admin
    │   ├── components/
    │   └── lib/
    └── Dockerfile
```

---

## Phase 1 — Project Scaffolding

**Goal:** Create the folder skeleton, install dependencies, verify toolchains run.

**Backend tasks:**
- Create `ai-assistance/backend/` with `app/`, `scripts/`, `tests/`
- `requirements.txt`: `fastapi`, `uvicorn`, `sqlalchemy`, `alembic`, `psycopg2-binary`, `chromadb`, `sentence-transformers`, `openai`, `python-jose[cryptography]`, `passlib[bcrypt]`, `python-multipart`, `aiofiles`, `python-dotenv`
- `app/core/config.py` — pydantic settings from `.env` (`DATABASE_URL`, `OPENAI_API_KEY`, `SECRET_KEY`, `CHROMA_PATH`)
- `app/main.py` — FastAPI app factory, CORS, lifespan hook (starts vector DB on boot)

**Frontend tasks:**
- `npm create vite@latest frontend -- --template react-ts`
- Install: `axios`, `react-router-dom`, `zustand`, `@tanstack/react-query`, `tailwindcss`, `shadcn/ui`
- Wire up router with public/private route guards

**Deliverable:** `uvicorn app.main:app` boots; `vite` dev server boots.

---

## Phase 2 — Database Design & Migrations

**Goal:** Define all tables, run migrations with Alembic.

### Tables

| Table | Key Columns |
|-------|-------------|
| `users` | `id`, `customer_id` (UUID, public), `name`, `email`, `password_hash`, `role` (admin/basic/pro/ultra), `status` (pending/active/suspended) |
| `api_keys` | `id`, `user_id → users`, `key_prefix` (first 8 chars, shown), `key_hash` (bcrypt of full key), `label`, `revoked`, `last_used_at`, `created_at` |
| `plans` | `id`, `name`, `request_limit` (basic=500, pro=700, ultra=0=unlimited), `price_usd` |
| `subscriptions` | `id`, `user_id`, `plan_id`, `status` (pending_payment/active/expired), `expires_at` |
| `payments` | `id`, `user_id`, `plan_id`, `receipt_path`, `status` (pending/approved/rejected), `reviewed_by`, `reviewed_at`, `notes` |
| `usage_daily` | `id`, `api_key_id`, `date` (date), `count` — composite unique `(api_key_id, date)` |
| `chat_sessions` | `id`, `user_id`, `title`, `created_at`, `updated_at` |
| `chat_messages` | `id`, `session_id`, `role` (user/assistant), `content`, `prompt_tokens`, `completion_tokens`, `created_at` |

### Key Rules
- `api_keys.key_hash` — never store plaintext key; generated key shown only once at creation
- `usage_daily` — on each request: `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1`

**Deliverable:** `alembic upgrade head` creates all tables; seed script inserts default plans and one admin user.

---

## Phase 3 — RAG Vectorization Pipeline

**Goal:** Convert all 34 markdown files in `rag_data/` into a searchable ChromaDB collection.

### Script: `scripts/build_vectordb.py`

Steps:
1. Walk every `.md` file under `rag_data/`
2. Split each file into chunks by `##` heading (keep heading as first line of chunk, max ~600 tokens per chunk)
3. Attach metadata to each chunk: `{ file_path, role (admin|driver|shipper|identity), section, heading }`
4. Embed all chunks using `sentence-transformers/all-MiniLM-L6-v2` (local, no API key needed)
5. Upsert into ChromaDB persistent collection `africa_logistics_kb` — document ID = `sha256(file_path + heading)`
6. On re-run: compare content hash, skip unchanged chunks (incremental rebuild)

### Query Service: `app/services/rag/query.py`

```
embed(user_question)
→ chromadb.collection.query(n_results=5, where={"role": detected_role})
→ return top-5 chunks with scores
→ build context block: "Source: {file_path}\n{chunk_text}"
```

**Role detection:** read `role` field from the API key owner's `users.role`.
- Admin → filter `where role IN [admin, identity]`
- Shipper → `[shipper, identity]`
- Driver → `[driver, identity]`

**Deliverable:** Script runs, `rag_data/` indexed, `query("how do I accept a job?")` returns relevant `my_jobs.md` chunks.

---

## Phase 4 — LLM Integration & Chat Core

**Goal:** Wire RAG context + chat history into an LLM call; stream response back.

### Service: `app/services/llm/chat.py`

Prompt structure:
```
[SYSTEM]
{contents of identity/who_am_i.md}

[CONTEXT – from RAG]
Source: driver/my_jobs.md / § Accepting a Job
...chunk text...

[HISTORY – last 10 messages from chat_sessions]
User: ...
Assistant: ...

[USER]
{current question}
```

### LLM Call
- Provider: OpenAI (`gpt-4o-mini` default, configurable via settings)
- Streaming: `stream=True`, yield chunks via FastAPI `StreamingResponse`
- On completion: save usage tokens to `chat_messages`, increment `usage_daily`

### Long-Term Memory
- Every session has a `chat_session` row (title auto-generated from first user message)
- All messages persisted to `chat_messages` in order
- History window per call: last 10 messages from that session (configurable)
- Sessions are per-user; users can list, rename, and delete sessions

**Deliverable:** `POST /api/ask` with valid API key returns streamed answer grounded in RAG data; message saved to DB.

---

## Phase 5 — API Key System & Usage Middleware

**Goal:** Full API key lifecycle + request quota enforcement.

### Key Generation Flow
1. User registers → system auto-creates one key: `bemnet_live_<32 random chars>`
2. Full key shown once in response — never stored in plaintext (only bcrypt hash stored)
3. User can create additional named keys, revoke keys

### Request Middleware: `app/core/middleware.py`

```
extract Bearer token from Authorization header
→ find api_key row where key_hash matches
→ check revoked = false
→ check user.status = active
→ get user's active subscription → plan.request_limit
→ get today's usage_daily count for this key
→ if count >= limit: return 429 { "error": "quota_exceeded", "used": N, "limit": M }
→ allow request → after response: increment usage_daily
```

### Quota Rules

| Plan | Daily Limit |
|------|------------|
| Basic | 500 |
| Pro | 700 |
| Ultra | Unlimited (∞) |
| Admin | 500 (for AI assistant use) |

### Plan Upgrade Flow
1. User picks plan on `/plans` page → `POST /payments/upload` with plan_id + receipt file
2. Receipt saved to `uploads/receipts/{uuid}.{ext}` (server-side path; access via admin only)
3. Admin reviews → `PATCH /admin/payments/{id}/approve` or `reject`
4. On approve: create/update `subscriptions` row, set `status=active`, set `expires_at` (30 days)

**Deliverable:** 429 returned when quota hit; upgrade flow creates payment row and admin sees it in panel.

---

## Phase 6 — API Routes (Full Map)

### Auth & User
```
POST   /auth/register          public — email+pass+name → customer_id + api_key (shown once)
POST   /auth/login             public — email+pass → JWT
GET    /auth/me                JWT — current user profile
```

### AI Chat
```
POST   /api/ask                API key — { session_id?, question } → streamed answer
GET    /api/sessions           API key — list chat sessions
POST   /api/sessions           API key — create session → session_id
GET    /api/sessions/{id}      API key — messages in session
DELETE /api/sessions/{id}      API key — delete session + messages
```

### Keys & Usage
```
GET    /api/keys               JWT — list my keys
POST   /api/keys               JWT — create new key
DELETE /api/keys/{id}          JWT — revoke key
GET    /api/usage              JWT — today's count + monthly breakdown + plan limit
```

### Plans & Payments
```
GET    /plans                  public — list available plans
POST   /payments/upload        JWT — upload receipt + plan choice
GET    /payments/my            JWT — my payment history
```

### Admin (JWT, role=admin)
```
GET    /admin/users                       list all users with status + plan
PATCH  /admin/users/{id}                  activate / suspend / change role
GET    /admin/payments                    list all pending receipts
PATCH  /admin/payments/{id}/approve       approve payment + activate subscription
PATCH  /admin/payments/{id}/reject        reject payment + optional note
GET    /admin/usage                       usage stats per user / per key / per day
GET    /admin/keys                        all keys (can revoke any)
DELETE /admin/keys/{id}                   revoke any key
GET    /admin/sessions                    all chat sessions (audit)
PUT    /admin/plans/{id}                  update plan limit or price
```

---

## Phase 7 — Frontend Pages

### Public Pages
| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | What Bemnet is, 3 plan cards, Register/Login CTAs |
| `/register` | Register | email, name, password → show API key once with copy button |
| `/login` | Login | email + password → JWT in localStorage |

### Authenticated User Pages (`/dashboard`)
Sidebar with the following sections:

| Section | Content |
|---------|---------|
| **Chat** | Session list (left panel), chat window (right panel), new session button, streamed responses |
| **API Keys** | Table of keys (key prefix visible), create new, revoke |
| **Usage** | Progress bar (used / limit), daily chart (last 30 days), current plan badge |
| **Plans & Billing** | Plan cards, current plan highlighted, "Upgrade" → upload receipt form |
| **Payment History** | List of submitted receipts with status badges (pending / approved / rejected) |

### Admin Page (`/admin`)
Separate layout, accessed with admin JWT:

| Tab | Content |
|-----|---------|
| **Users** | Searchable table, status badge, activate/suspend actions, plan shown |
| **Payments** | Pending receipts with preview link, approve/reject + note |
| **Usage** | Top consumers chart, per-user breakdown table |
| **Keys** | All keys for all users, revoke button |
| **Plans** | Edit `request_limit` and price per plan |
| **Sessions** | Browse all chat sessions with user attribution |

---

## Phase 8 — Docker & Project Wiring

### Services
```yaml
services:
  db:
    image: postgres:16-alpine
    port: 5432
    volume: pg_data

  chroma:
    image: chromadb/chroma
    port: 8000
    volume: chroma_data

  backend:
    build: ./backend
    port: 8001
    depends_on: [db, chroma]
    startup: alembic upgrade head → build_vectordb.py → uvicorn

  frontend:
    build: ./frontend
    port: 3000
    serves: nginx + Vite build
```

### Startup Sequence
1. `db` healthy → `chroma` healthy
2. `backend` runs `alembic upgrade head` then `scripts/build_vectordb.py` then starts uvicorn
3. `frontend` serves static build via nginx

### Environment Variables (`.env`)
```env
DATABASE_URL=postgresql://user:pass@db:5432/bemnet
OPENAI_API_KEY=sk-...
SECRET_KEY=<random 64 chars>
CHROMA_PATH=/chroma_data
CHROMA_HOST=chroma
CHROMA_PORT=8000
RECEIPT_UPLOAD_PATH=/uploads/receipts
JWT_EXPIRE_MINUTES=60
HISTORY_WINDOW=10
```

### Portability
The entire `ai-assistance/` folder is self-contained. Copy it anywhere, set `.env`, run `docker compose up`. It reads RAG data from `backend/rag_data/` (copy of `ai-assistance-rag-data/`), rebuilds the vector DB on first boot, and is immediately ready.

---

## Execution Order Summary

| Phase | What Gets Built | Depends On |
|-------|-----------------|------------|
| 1 | Folder skeleton, deps, app boots | — |
| 2 | DB tables, Alembic migrations, seed data | Phase 1 |
| 3 | RAG pipeline, ChromaDB indexed, query works | Phase 1, RAG files copied |
| 4 | LLM chat core, sessions, history saved | Phase 2, 3 |
| 5 | API keys, usage middleware, quota 429 | Phase 2 |
| 6 | All API routes wired end-to-end | Phase 4, 5 |
| 7 | Full frontend: chat, keys, usage, admin panel | Phase 6 |
| 8 | Docker Compose, env, startup script | All phases |
