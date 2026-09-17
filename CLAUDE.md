# MedSeek — Project Reference

## What this is

MedSeek is two connected products:

1. **Disease/symptom search engine** — public, SEO-indexable, ranks likely diseases based on symptom match plus seasonal/geographic/statistical signals (like Google, applied to health).
2. **Context-aware health AI chatbot** — grounded in a patient's own medical history (not a generic one-shot chatbot), gated behind login. Always shows a disclaimer that it's an AI, not a doctor.

Connecting both: an **encrypted personal health data vault**. Patients store their own health data (conditions, medications, allergies, reports) securely, and it feeds the AI chatbot's context. This is a personal vault only — no hospitals, no external access requests, no consent-sharing system.

### Why it exists
People already use general AI chatbots (Claude, Gemini, ChatGPT) for symptom questions, but those bots have no memory of the person's actual medical history, so answers stay generic. MedSeek's edge is grounding AI answers in real patient context, kept in one place the patient controls.

---

## Repos

- **`medseek-frontend`** — Next.js (React + Tailwind). Serves the public search engine and the logged-in patient dashboard, chat, vault, and activity pages.
- **`medseek-backend`** — Node.js + TypeScript + Express. Owns *all* business logic: search ranking, AI/RAG orchestration, auth, encryption, audit logging.

**Non-negotiable rule:** the frontend never contains business logic. Every meaningful operation goes through an HTTP call to `medseek-backend`.

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js, React, Tailwind | Public pages SSR for SEO |
| Backend | Node.js, TypeScript, Express | Modular router/service architecture |
| Database | PostgreSQL (Neon serverless) | pgvector included |
| Search | Postgres FTS + `pg_trgm` (V1) | Custom ranking with sf-idf weights |
| LLM | Deepseek API (OpenAI-compatible SDK) | RAG-grounded in patient context |
| Auth | bcryptjs + jsonwebtoken | 15min access + 7d refresh tokens |
| Encryption | AES-256-GCM (Node crypto) | Envelope encryption, per-record IV |
| Hosting | Vercel (Frontend) + Render (Backend) + Neon (Postgres) | All free tier (Live: https://med-seek-theta.vercel.app) |

---

## Architecture

```
Patient app ─► API Gateway (auth + audit) ─┬─► Disease Search Service ─► Postgres (search index)
                                            ├─► Health AI Service (RAG) ─► Deepseek + pgvector
                                            ├─► Data Vault Service ─► AES-256-GCM encrypted storage
                                            └─► Audit Log Service ─► access_log table
```

---

## Build roadmap

- [x] **Phase 0 — Setup**: repos, Express scaffold, Postgres schema, CI
- [x] **Phase 1 — Search engine MVP**: symptom search, sf-idf ranking, disease detail pages, synonym matching, Kaggle dataset. Code complete. DB seeded and verified with Neon Postgres.
- [x] **Phase 2 — Patient auth + profile**: JWT auth (bcryptjs + jsonwebtoken), signup/login/refresh, profile CRUD, AuthGuard, frontend login/signup/dashboard pages.
- [x] **Phase 3 — AI health chat**: Deepseek API integration via OpenAI SDK, RAG context building from patient profile + health records, escalation logic for red-flag symptoms (cardiac, stroke, breathing, allergic, suicidal, meningitis, abdominal emergencies), recurring medical disclaimer, chat session management. Frontend: chat page with session sidebar, message bubbles, disclaimer modal, typing indicator.
- [x] **Phase 4 — Encrypted data vault**: AES-256-GCM encryption (Node crypto), envelope encryption with per-record IV, CRUD with encrypt-on-write/decrypt-on-read, record type management (conditions, medications, allergies, reports). Frontend: vault page with type filter tabs, record detail panel, add/delete modal, encryption notice.
- [x] **Phase 5 — Audit log**: audit logging middleware (auto-logs all authenticated API access with action/target/success), audit service with paginated queries and action filters. Frontend: activity page with action filter dropdown, paginated log entries, human-readable action labels.
- [x] **Phase 6 — Ranking refinement**: added demographic filter support (age, sex, pregnancy) to search validation schema. Full signal blending (seasonal/geographic) deferred to data availability.
- [x] **Phase 7 — UI/UX & Design System Standardization**: Unified visual language across all pages (Blue `#3b82f6` + Emerald `#10b981` + Slate `#0f172a`), eliminated rogue indigo/violet/zinc palettes, resolved light-theme contrast leaks and dead dark-mode styling, fixed mobile navigation drawer, and standardized component cards and alerts.
- [x] **Phase 8 — Cloud Deployment Preparation**: Express host binding to `0.0.0.0`, flexible multi-origin & Vercel preview domain CORS handling, comprehensive root `.gitignore`, verified 6/6 vitest tests and Next.js 16 production build.
- [x] **Phase 9 — Codebase Cleanup & Bloat Elimination**: Purged unused starter SVG assets, redundant frontend CLAUDE/AGENTS stubs, dead placeholder functions (`authorize`, `internal`, `transaction`, `createSessionSchema`), unused Zod type exports, dead CSS keyframes (`data-rain`, `scan-line`), and fixed all ESLint warnings (unused vars in `DiseaseCard` and `HumanBodyModel`). Verified 0 ESLint warnings, 0 type errors, 6/6 vitest passes, and clean production build.
- [x] **Phase 10 — Mobile Responsiveness & Solid Palette Modernization**: Full mobile viewport optimization across all routes (responsive sticky header, slide-out mobile drawer with tap-to-close backdrop, 100dvh AI chat layout with dedicated top bar and drawer, 2-column mobile dashboard quick-actions, responsive score bars, and 16px form inputs to prevent iOS Safari auto-zoom). Completely dropped all gradients across the entire frontend UI (buttons, cards, icons, text clips, and progress bars) in favor of a clean, crisp solid Cerulean Blue palette. Verified 0 ESLint warnings, 0 type errors, 6/6 vitest passes, and clean Next.js 16 build.
- [x] **Phase 11 — Cloud Production Resilience & Centralized API Routing**: Centralized API URL resolution into `src/lib/config.ts` with automatic production fallback to `https://medseek-backend.onrender.com` when `NEXT_PUBLIC_API_URL` is omitted during Vercel builds. Eliminates hardcoded localhost build-time inlining and browser mixed-content/connection-refused blocking. Verified live search, auth, and Vercel bundle deployment.
- [ ] **Future / post-MVP**: OCR report upload, PWA, React Native, Typesense migration, DDXPlus model training, ICD-11 taxonomy, MedlinePlus content

---

## API Routes (Complete)

### Public (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/search` | Multi-symptom disease search |
| GET | `/api/search/diseases/:id` | Disease detail |
| GET | `/api/search/symptoms/autocomplete` | Symptom autocomplete |

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Authenticate |
| POST | `/api/auth/refresh` | Refresh tokens |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/auth/profile` | Full profile |
| PUT | `/api/auth/profile` | Update profile |

### AI Chat (auth required)
| Method | Path | Description |
|---|---|---|
| POST | `/api/ai/sessions` | Create chat session |
| GET | `/api/ai/sessions` | List sessions |
| GET | `/api/ai/sessions/:id` | Get session + messages |
| POST | `/api/ai/sessions/:id/messages` | Send message, get AI response |

### Vault (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/api/vault/records` | List records (metadata) |
| GET | `/api/vault/records/:id` | Get record (decrypted) |
| POST | `/api/vault/records` | Create encrypted record |
| PUT | `/api/vault/records/:id` | Update record |
| DELETE | `/api/vault/records/:id` | Delete record |

### Audit (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/api/audit/log` | Patient's activity log |
| GET | `/api/audit/actions` | Distinct action types |

---

## Frontend Pages

| Path | Auth | Description |
|---|---|---|
| `/` | No | Symptom search engine (public) |
| `/disease/[id]` | No | Disease detail page (SSR, SEO) |
| `/login` | No | Login form |
| `/signup` | No | Signup form |
| `/dashboard` | Yes | Patient dashboard + profile editor |
| `/chat` | Yes | AI health chat with session management |
| `/vault` | Yes | Encrypted health record vault |
| `/activity` | Yes | Access/activity audit log |

---

## How to Run Locally

To start the project manually when everything is stopped, open two terminal windows from the repository root:

### 1. Start the Backend (API Server)
```bash
cd medseek-backend
npm run dev
```
> Runs at **http://localhost:4000** (Health check: `http://localhost:4000/health`)

### 2. Start the Frontend (Web App)
```bash
cd medseek-frontend
npm run dev
```
> Runs at **http://localhost:3000**

---

## Environment Variables Required

```bash
# Backend (.env)
DATABASE_URL=postgresql://...      # Neon Postgres
JWT_SECRET=<openssl rand -hex 32>  # Auth signing
DEEPSEEK_API_KEY=sk-...            # AI chat
ENCRYPTION_KEY=<openssl rand -hex 32>  # Vault encryption
```

---

## Resolved decisions

backend framework (Express) · search (Postgres FTS + pg_trgm) · AI (Deepseek API, not trained model) · repo structure (separate) · dataset (Kaggle → DDXPlus → ICD-11) · encryption (AES-256-GCM, server-managed) · no hospitals/third-party access · hosting (Vercel + Render + Neon) · auth (bcryptjs + JWT dual-token) · audit (auto-logging middleware) · vault encryption (envelope pattern, per-record IV) · UI design system (Cerulean Blue solid palette, all gradients eliminated, light-mode first with WCAG AA contrast) · mobile-first responsive layout (100dvh chat, dedicated top bar, slide-out drawer, iOS auto-zoom prevention) · deployment (Render for Express backend + Vercel for Next.js 16 frontend + Neon PostgreSQL) · flexible CORS (comma-separated origins + *.vercel.app) · zero-warning code cleanup (dead code, starter bloat, unused schemas purged)

## Agent Rules & Guidelines
- **Task Completion:** After finishing any task or setup phase, immediately update `CLAUDE.md` before concluding the response.
- **What to update:** Record architectural decisions, resolved open questions, updated progress, and new next steps under the appropriate sections.
