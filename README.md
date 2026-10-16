# MedSeek

A clinical decision support and patient health platform combining a domain-adapted differential diagnostic search engine, context-aware RAG AI consultation, an AES-256-GCM encrypted personal health vault, and an interactive 3D anatomical raycasting interface.

---

## Architecture Overview

MedSeek is architected as two decoupled applications with strict separation of concerns:

- **`medseek-backend`** (Node.js / Express / TypeScript): Owns all business logic, search ranking algorithms, database persistence, LLM orchestration, cryptographic envelope encryption, and non-blocking audit logging.
- **`medseek-frontend`** (Next.js 16 / React 19 / TypeScript / Tailwind CSS): Lightweight presentation and SSR layer providing SEO-indexed disease monographs, interactive 3D human body visualization, patient dashboard, health records management, and security activity ledger.

```
┌────────────────────────────────┐
│      Next.js Frontend          │
│   (SSR, 3D WebGL, Dashboard)   │
└───────────────┬────────────────┘
                │ HTTP / REST (JWT)
┌───────────────▼────────────────┐
│       Express API Gateway      │
│   (Auth, Audit Log Middleware) │
└───────┬───────┬────────┬───────┘
        │       │        │
   ┌────┴───┐ ┌─┴────┐ ┌─┴────────────┐
   │ Search │ │ RAG  │ │ Encrypted    │
   │ Engine │ │ AI   │ │ Data Vault   │
   └────┬───┘ └─┬────┘ └─┬────────────┘
        │       │        │ (AES-256-GCM)
┌───────▼───────▼────────▼───────┐
│     PostgreSQL Database        │
│ (pg_trgm, pgvector, unaccent)  │
└────────────────────────────────┘
```

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher (pnpm/yarn also supported)
- **PostgreSQL**: PostgreSQL 15+ (with `pg_trgm` and `unaccent` extensions enabled; Neon Serverless recommended)

---

## Quickstart Guide

### 1. Clone & Setup Workspace

```bash
git clone <repository-url>
cd MedSeek
```

### 2. Backend Setup

```bash
cd medseek-backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your PostgreSQL DATABASE_URL, JWT_SECRET, and ENCRYPTION_KEY

# Run database migrations
npm run migrate:up

# (Optional) Seed symptoms and Kaggle dataset
npm run seed

# Start API server in development mode (runs on http://localhost:4000)
npm run dev
```

### 3. Frontend Setup

In a new terminal window:

```bash
cd medseek-frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# By default, NEXT_PUBLIC_API_URL points to http://localhost:4000

# Start frontend development server (runs on http://localhost:3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

### Backend (`medseek-backend/.env`)

| Variable | Description | Default / Example |
|---|---|---|
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `PORT` | API server port | `4000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `CORS_ORIGIN` | Allowed client origin(s) | `http://localhost:3000` |
| `JWT_SECRET` | Secret key for signing auth tokens (32+ bytes hex) | Generate with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM vault envelope encryption | Generate with `openssl rand -hex 32` |
| `DEEPSEEK_API_KEY` | DeepSeek LLM API key (required for AI consultation) | `sk-...` |
| `DEEPSEEK_BASE_URL` | DeepSeek API base URL | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Model identifier | `deepseek-chat` |

### Frontend (`medseek-frontend/.env.local`)

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API gateway | `http://localhost:4000` |

---

## Key Modules & Core Features

### 1. Clinical Diagnostic Search Engine
- **Custom *sf-idf* (Symptom Frequency – Inverse Disease Frequency)** algorithm weights distinctive clinical symptoms higher than non-specific symptoms.
- **3-Tier Symptom Matching**: Exact matches, fuzzy trigram similarity (`pg_trgm > 0.3`), and clinical synonym normalizations.
- **Emergency "Don't Rule Out" Container**: Automatically surfaces critical emergency conditions even if lower in probabilistic ranking.
- Sub-50ms autocomplete via PostgreSQL CTE queries.

### 2. Context-Aware RAG Health AI
- DeepSeek API integration with dynamic patient context compilation.
- Injects decrypted patient records (active conditions, medications, allergies, vitals) into the LLM system prompt.
- **Deterministic Hard-Stop Guardrails**: Zero-latency regex/heuristic scanner (`checkEscalation`) intercepts 7 acute syndrome clusters (cardiac, stroke, anaphylaxis, respiratory distress, meningitis, acute abdomen, crisis) *before* any LLM API invocation, routing immediately to emergency protocols.

### 3. Cryptographic Health Data Vault
- Authenticated **AES-256-GCM envelope encryption** at rest using Node.js native `crypto`.
- Packed binary blobs containing `[12B IV][16B Auth Tag][Ciphertext]` stored in PostgreSQL `bytea` columns.
- Cryptographic tamper detection and row-level ownership isolation (`WHERE id = $1 AND patient_id = $2`).

### 4. Forensic Security & Audit Ledger
- Asynchronous Express response lifecycle middleware (`auditLogger`) logs all authenticated actions without adding request latency.
- Security command center (`/activity`) with temporal clustering, KPI metrics, multi-criteria filters, and one-click patient CSV export.

### 5. Interactive 3D Anatomical Raycaster
- Built with Three.js, `@react-three/fiber`, and `@react-three/drei`.
- Raycasts directly against 3D human mesh geometry to identify 16 anatomical subregions with smooth camera kinematics and bilateral symptom highlighting.

---

## Available Scripts

### Backend (`medseek-backend`)

```bash
npm run dev            # Start development server with hot-reloading (tsx watch)
npm run build          # Compile TypeScript to dist/
npm start              # Run production compiled build
npm test               # Run test suite with Vitest
npm run lint           # Run ESLint on source files
npm run typecheck      # Validate TypeScript types without emitting files
npm run migrate:up     # Run pending database migrations
npm run seed           # Seed dataset and calculate sf-idf weights
```

### Frontend (`medseek-frontend`)

```bash
npm run dev            # Start Next.js development server with Turbopack
npm run build          # Build production bundle
npm start              # Start production server
npm run lint           # Run ESLint validation
```

---

## Verification & Quality Standards

- **Integration Tests**: 6/6 route test suites passing (`npm test` in backend)
- **TypeScript**: Strict typechecking passes across all modules (`npm run typecheck`)
- **Linting**: 0 ESLint warnings or errors (`npm run lint` across frontend and backend)
- **Production Build**: 100% clean Next.js 16 build pass

---

## Team Contribution Guidelines

1. **Architecture Rule**: The frontend must never contain business logic or database access. All operations must route through `medseek-backend`.
2. **Secrets & Security**: Never commit `.env` or `.env.local` files to source control. Always update `.env.example` when introducing new configuration variables.
3. **Branching**: Create feature branches from `main` (`feature/<feature-name>` or `fix/<fix-name>`).
4. **Pre-PR Checks**: Before submitting pull requests, ensure both backend and frontend pass linting, typechecks, and tests:
   ```bash
   (cd medseek-backend && npm test && npm run typecheck && npm run lint)
   (cd medseek-frontend && npm run lint && npm run build)
   ```
