# AGENTS.md

This file provides guidance to Codex and other AI agents when working with code in this repository.

## Session start (obligatoire)

À chaque début de session sur ce projet, invoquer `/obsidian-context` **avant toute action**.
Obsidian est le second cerveau du projet — il contient le contexte à jour, le backlog,
et les décisions prises entre les sessions. Ne pas commencer à coder ou planifier sans
avoir chargé ce contexte.

Si Obsidian n'est pas ouvert, le skill se rabat sur `CONTEXT.md` + mémoire projet.

### Trouver les notes destinées aux agents

Les notes Obsidian à lire en priorité portent le tag `agents`. Pour les récupérer :
```
obsidian search query="tag:agents" limit=20
```

Notes taguées `agents` pour ce projet (vault `Adam's Vault`) :
- `6 - Main Notes/Pro/BeeNice/Bee Nice Calendar.md` — statut projet, backlog, contacts
- `6 - Main Notes/Pro/BeeNice/Spécifications Fonctionnelles.md` — toutes les features avec logique métier
- `6 - Main Notes/Pro/BeeNice/Architecture Technique.md` — modules, routes API, schéma DB
- `6 - Main Notes/Pro/BeeNice/issues/*.md` — issues ouvertes (routing, Azure)

## Fin de session / après décision majeure

Invoquer `/sync-project-to-obsidian` après :
- toute session de planification ou de livraison
- toute décision d'architecture ou de scope
- toute réunion client dont les notes ont été partagées

Cela maintient Obsidian synchronisé pour les prochaines sessions et les autres agents.

## Agent skills

### Issue tracker

Issues live as markdown files in the external Obsidian vault folder. See `docs/agents/issue-tracker.md`.

Canonical issue folder:

```text
/Users/aramsis/Library/Mobile Documents/iCloud~md~obsidian/Documents/Adam's Vault/6 - Main Notes/BeeNice/issues
```

### Triage labels

Use the default five-state triage vocabulary. See `docs/agents/triage-labels.md`.

- `needs-triage`: maintainer needs to evaluate this issue
- `needs-info`: waiting on reporter for more information
- `ready-for-agent`: fully specified, ready for an AFK agent
- `ready-for-human`: requires human implementation
- `wontfix`: will not be actioned

### Domain docs

Single-context repo: read root `CONTEXT.md` and `docs/adr/` when present. See `docs/agents/domain.md`.

If those files do not exist, proceed silently. They are created lazily when project language or architecture decisions are clarified.

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
