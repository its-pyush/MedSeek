# MedSeek Frontend

Next.js web application for MedSeek — featuring a public symptom search engine, disease detail pages (SSR/SEO), authenticated patient dashboard, RAG-grounded AI health chat, encrypted data vault, and audit activity log.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional, defaults to http://localhost:4000)
# NEXT_PUBLIC_API_URL=http://localhost:4000

# 3. Start development server
npm run dev
```

The app starts at `http://localhost:3000`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Build optimized production bundle |
| `npm run start` | Run production server |
| `npm run lint` | Run ESLint across source files |

## Pages

- `/` — Public multi-symptom search engine with 3D human anatomy visualizer
- `/disease/[id]` — SSR disease detail page with ICD-11 codes and weighted symptoms
- `/login` & `/signup` — Patient authentication
- `/dashboard` — Patient health profile editor and quick actions
- `/chat` — Context-aware AI health chat with red-flag escalation
- `/vault` — Encrypted health record management (AES-256-GCM at rest)
- `/activity` — Access and activity audit log

## Tech Stack

- **Framework**: Next.js 16 (React 19, App Router)
- **Styling**: Tailwind CSS v4
- **3D Graphics**: Three.js + React Three Fiber / Drei
- **Fonts**: Roboto (Google Fonts via `next/font`)
