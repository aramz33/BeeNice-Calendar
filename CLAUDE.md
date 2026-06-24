# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BeeNice Calendar — B2B booking tool. Be Nice callers book discovery meetings for
prospects onto a client's sales reps' calendars. Runnable product is under `mvp/`
(Hono + SQLite backend, React 18 frontend, Nylas calendar provider). Target: v0
live early July 2026; first client Cosy RH (Microsoft/Azure).

## "Where are we?" — how to resume

State, next action, and decisions are NOT duplicated here — they live in the
Obsidian vault (single source of truth). To answer "where are we / what's next":

1. **Read the entrypoint** via the `adam-vault` skill →
   `6 - Main Notes/Pro/BeeNice/TODO.md`. `## Resume` = goal, current state, frozen
   facts, next action; `## Checklist` = done vs. remaining. That file alone is enough.
2. **Depth on demand**: `Pro/BeeNice/LOG.md` (append-only history + decision
   rationale) · `ARCHITECTURE.md` (code map) · `wiki/` (overview, functional-spec,
   routing-design, microsoft-enterprise-auth, nylas-microsoft-oauth).
3. **Cross-check code**: root `CONTEXT.md` (domain terms + product decisions) and
   `git log` confirm what's actually committed.

## End of session

Use the `handoff` skill — it rewrites `TODO.md` in place and appends to `LOG.md`.
Never create dated handoff files at the project root.

## Agent skills

### Issue tracker

No separate issues folder. Open work and unresolved questions live as checklist
items in `Pro/BeeNice/TODO.md`; technical design notes for open questions live in
`Pro/BeeNice/wiki/` (e.g. `routing-design.md`, `microsoft-enterprise-auth.md`).

### Triage labels

Use the default five-state triage vocabulary. See `docs/agents/triage-labels.md`.

- `needs-triage`: maintainer needs to evaluate this issue
- `needs-info`: waiting on reporter for more information
- `ready-for-agent`: fully specified, ready for an AFK agent
- `ready-for-human`: requires human implementation
- `wontfix`: will not be actioned

### Domain docs

Single-context repo: read root `CONTEXT.md` and `docs/adr/` when present. See `docs/agents/domain.md`.

### Delivery scoping (mandatory before major decisions)

Before any of the following, invoke `/delivery-scoping`:
- Deciding to rewrite vs. continue on the codebase
- Starting a new sprint with a client deadline
- Estimating scope for a new client

The skill explores the codebase first, surfaces the real critical path, and outputs a
concrete timeline. Never start implementation planning from assumptions alone.

### Domain grilling (before adding new concepts)

Before adding new domain terms, routes, or data models, invoke `/grill-with-docs` to
challenge the new concept against `CONTEXT.md` and the existing schema. This prevents
terminology drift and catches contradictions early.

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
- *Callers* are BeeNice employees who use the workspace to book meetings for prospects.
- *Reps* are the client's sales representatives who receive booked meetings.
- *Routing* assigns reps to bookings via weighted round-robin by percentage per rep (e.g. 10/10/40/40). See `CONTEXT.md` for the full decision record.
- *Availability* is computed live from rep calendar connections, existing bookings, and buffer times (15 min before + 15 min after each booking).
- Slot invalidation across open browser tabs is pushed via SSE (`/api/book/:slug/stream`).
- Booking status transitions are stored as an immutable history (`booking_status_history` table); the current status is derived from the latest entry.

## TypeScript conventions

- No `any` without a justification comment; prefer `unknown`.
- Named exports only; no default exports.
- Explicit return types on all exported functions.
- Import order: external → internal (`@mvp/`, `@shared-*`) → relative.
- File names: kebab-case. Types/interfaces/components: PascalCase. Functions/variables: camelCase. Constants: SCREAMING_SNAKE_CASE.

## Working notes

- Prefer existing repo patterns and local helper APIs over new abstractions.
- Keep MVP-specific behavior inside `mvp/`; keep `src/` limited to shared UI primitives.
- For frontend changes, keep API calls routed through `mvp/src/lib/api.ts` and rely on the Vite proxy for `/api/*`.
- For backend changes, preserve the plain Node HTTP server style unless the project explicitly moves to a framework.
- Do not manually edit seeded SQLite data as the source of truth; update seed or state/database logic instead.
- When changing booking, availability, routing, calendar-provider, or status-history behavior, add focused coverage for the affected path where practical.
- The `company_size` routing criterion is intentionally hidden from the default template. Do not re-expose it without an explicit instruction.
