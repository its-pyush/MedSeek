# MedSeek Backend

Disease search engine, health AI chatbot, and encrypted personal health data vault API.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL database connection string

# 3. Run database migrations
npm run migrate:up

# 4. (Optional) Seed test data
npm run seed

# 5. Start development server
npm run dev
```

The server starts at `http://localhost:4000`. Verify with:

```bash
curl http://localhost:4000/health
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production build |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint source files |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format with Prettier |
| `npm run typecheck` | Type-check without emitting |
| `npm run migrate:up` | Run pending migrations |
| `npm run migrate:down` | Rollback last migration |
| `npm run migrate:create` | Create a new migration file |

## Project Structure

```
src/
├── config/         # Environment validation (zod)
├── db/             # Database connection pool
├── middleware/      # Express middleware (auth, logging, errors)
├── modules/
│   ├── search/     # Disease/symptom search engine (Phase 1)
│   ├── ai/         # Health AI chatbot (Phase 3)
│   ├── vault/      # Encrypted data vault (Phase 4)
│   ├── auth/       # Patient authentication (Phase 2)
│   └── audit/      # Access audit log (Phase 5)
├── app.ts          # Express app factory
└── index.ts        # Server entry point
migrations/         # SQL migration files
scripts/            # Utility scripts (seed, weight computation)
```

## API Routes

| Method | Path | Module | Phase |
|---|---|---|---|
| GET | `/health` | Core | 0 |
| * | `/api/search/*` | Search | 1 |
| * | `/api/auth/*` | Auth | 2 |
| * | `/api/ai/*` | AI | 3 |
| * | `/api/vault/*` | Vault | 4 |
| * | `/api/audit/*` | Audit | 5 |

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **Database**: PostgreSQL (Neon, serverless)
- **Migrations**: node-pg-migrate
- **Testing**: Vitest + Supertest
- **Linting**: ESLint + Prettier
