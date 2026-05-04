# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent skills

### Issue tracker

Issues live as markdown files in the external Obsidian vault folder. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-state triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: read root `CONTEXT.md` and `docs/adr/` when present. See `docs/agents/domain.md`.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start API + frontend concurrently
npm run dev:api      # API only (http://localhost:8787)
npm run dev:web      # Vite frontend only (http://localhost:5174)
npm run build        # production build
```

Environment variables (optional overrides):

```bash
MVP_API_PORT=8787
MVP_WEB_PORT=5174
MVP_DB_PATH=mvp/server/data/mvp.sqlite
MVP_CALENDAR_PROVIDER=mock   # or "nylas"
MVP_NYLAS_API_KEY=...
MVP_NYLAS_CLIENT_ID=...
MVP_NYLAS_CALLBACK_URL=http://localhost:8787/api/admin/integrations/nylas/callback
```

## Architecture

The repository has two independent layers:

### `src/` — shared UI primitives

Components and hooks shared between the prototype and the MVP. Referenced by the MVP via Vite aliases (`@shared-ui`, `@shared-hooks`). Do not add MVP-specific logic here.

### `mvp/` — the runnable product demo

**Frontend** (`mvp/src/`): React 18 + React Router 7 + Tailwind CSS 4 + Radix UI. Entry point is `mvp/src/main.tsx`. Routes are declared in `mvp/src/routes.tsx`:
- `/` — shell/landing page
- `/book/:slug` — caller booking workspace
- `/admin/bookings` — admin supervision console

All API calls go through `mvp/src/lib/api.ts`. Types are in `mvp/src/lib/types.ts`. The Vite proxy forwards `/api/*` to the local Node server, so the frontend never calls the API port directly.

**Backend** (`mvp/server/`): Plain Node.js HTTP server (`http.createServer`), no framework. All routes are manually matched with regex in `mvp/server/index.mjs`. The server depends on two modules:
- `mvp/server/lib/state.mjs` — business logic and all database operations (`createStore`)
- `mvp/server/lib/provider.mjs` — calendar provider abstraction (`createCalendarProvider`). Mock mode simulates connections in-memory; Nylas mode calls the real Nylas Hosted OAuth flow.
- `mvp/server/lib/database.mjs` — SQLite via `better-sqlite3`, seeded once on first run
- `mvp/server/lib/seed.mjs` — seeds one client, one booking link, two callers, three reps

**Key domain concepts:**
- A *booking link* has a slug (e.g. `teamstarter-discovery`) and belongs to a client.
- *Callers* are Be Nice employees who use the workspace.
- *Reps* are the client's sales representatives who receive booked meetings.
- *Routing* is weighted: if `companySize >= companySizeThreshold` (default 200), only senior reps are eligible; otherwise the full pool is used. Within the pool a weighted round-robin selects the rep with the highest deficit.
- *Availability* is computed live from rep calendar connections plus existing bookings + buffer times.
- Slot invalidation across open browser tabs is pushed via SSE (`/api/book/:slug/stream`).
- Booking status transitions are stored as an immutable history (`booking_status_history` table); the current status is derived from the latest entry.

## TypeScript conventions

- No `any` without a justification comment; prefer `unknown`.
- Named exports only; no default exports.
- Explicit return types on all exported functions.
- Import order: external → internal (`@mvp/`, `@shared-*`) → relative.
- File names: kebab-case. Types/interfaces/components: PascalCase. Functions/variables: camelCase. Constants: SCREAMING_SNAKE_CASE.
