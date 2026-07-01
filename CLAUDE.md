# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

BeeNice Calendar — B2B booking tool. BeeNice callers book discovery meetings for
prospects onto a client's sales reps' calendars. The runnable product is under
`mvp/` (Hono + SQLite backend, React 18 frontend, Nylas calendar provider).
Target: v0 live early July 2026; first client Cosy RH (Microsoft/Azure).

## Where are we? / end of session

State, next actions, and decisions are **not** duplicated here — they live in
`docs/project/` (the source of truth, committed to the repo so the team shares it). An
Obsidian vault mirror is synced occasionally by Adam, but **`docs/project/` in this repo
is authoritative** — read and write it here.

**The session flow (always follow it):**
- **Session start** → activate the **`caveman`** and **`ponytail`** skills, then invoke
  the **`beenice-resume`** skill. It reads `docs/project/TODO.md`
  (`## Resume` = goal, state, next action; `## Checklist` = done vs. remaining — usually
  enough on its own), then `ARCHITECTURE.md` / `LOG.md` / `wiki/` as needed.
- **End of work** → invoke the **`beenice-handoff`** skill. It rewrites `docs/project/TODO.md`
  in place, appends one dated `docs/project/LOG.md` entry (newest on top, never rewrite
  past entries), and updates `docs/project/ARCHITECTURE.md` when the code shape changed.

Both skills defer to one repo-local spec:
`.claude/skills/beenice-resume/references/project-structure.md`. The global `handoff`
skill targets the Obsidian vault; these project skills target `docs/project/` — keep them
separate. Notes use Obsidian-style `[[wikilinks]]` (path-independent; render as plain text
on GitHub). Never create dated handoff files in `docs/project/`.

- **Depth** → `docs/project/LOG.md`, `docs/project/ARCHITECTURE.md`,
  `docs/project/wiki/` (routing-design, microsoft-enterprise-auth, nylas-microsoft-oauth,
  brief-julien-auth-prod, …).
- **Cross-check** → root `CONTEXT.md` (domain terms + decisions) and `git log`.

## Workflow guardrails

- **Open work / issues**: no separate folder — checklist items in `docs/project/TODO.md`,
  design notes for open questions in `docs/project/wiki/`. Triage vocab: see
  `docs/agents/triage-labels.md`.
- **Before major decisions** (rewrite vs. continue, new sprint with a deadline,
  scoping a new client): invoke `/delivery-scoping` first — it explores the code
  and outputs a real critical path. Don't plan from assumptions alone.
- **Before adding domain terms, routes, or data models**: invoke `/grill-with-docs`
  to challenge the new concept against `CONTEXT.md` and the schema.

## Knowledge graph (save tokens — use before grepping)

`graphify-out/` holds a prebuilt knowledge graph of the whole repo (code AST + docs).
**For any "where/how/what-connects" question about the codebase, query the graph first** —
it returns a scoped subgraph, far cheaper than reading files or broad grep:

- `graphify query "<question>"` — broad context (BFS traversal)
- `graphify explain "<concept>"` — plain-language explanation of one node
- `graphify path "<A>" "<B>"` — how two concepts connect

Only read raw source after the graph has oriented you, or to edit/debug specific lines.
Rebuild after code changes: `graphify update .` (AST-only, free). Applies to subagents too.

## Commands

```bash
npm install     # install dependencies
npm run dev     # API + frontend concurrently
npm run dev:api # API only  (http://localhost:8787)
npm run dev:web # Vite only (http://localhost:5174)
npm run build   # production build
npm test        # server test suite (node --test)
```

Optional env overrides: `MVP_API_PORT`, `MVP_WEB_PORT`, `MVP_DB_PATH`,
`MVP_CALENDAR_PROVIDER` (`mock` | `nylas`), `MVP_NYLAS_API_KEY`,
`MVP_NYLAS_CLIENT_ID`, `MVP_NYLAS_CALLBACK_URL`, `BETTER_AUTH_SECRET`/`_URL`.

## Architecture

Two independent layers:

- **`src/`** — UI primitives shared between the prototype and the MVP, consumed via
  Vite aliases (`@shared-ui`, `@shared-hooks`). No MVP-specific logic here.
- **`mvp/`** — the runnable product.

**Frontend** (`mvp/src/`): React 18 + React Router 7 + Tailwind 4 + Radix. Routes in
`mvp/src/routes.tsx`: `/login`, `/connect/:inviteToken`, `/`, `/caller`,
`/book/:slug`, `/admin/bookings`, `/admin/settings`, `/admin/settings/connections`.
All API calls go through `mvp/src/lib/api.ts` (types in `lib/types.ts`); the Vite
proxy forwards `/api/*` to the server, so the frontend never hits the API port.

**Backend** (`mvp/server/`): Hono app built in `app.mjs` and served by
`@hono/node-server` from `index.mjs`. Routers are split under `lib/http/`
(`book-`, `caller-`, `admin-`, `connection-`, `webhook-routes.mjs`, `streams.mjs`,
`asset-routes.mjs`). Auth is better-auth (`lib/auth.mjs`): `requireAuth` guards
`/api/book` and `/api/caller`, `requireAdmin` guards `/api/admin`. Business logic
lives in domain modules — `bookings.mjs`, `connections.mjs`, `availability.mjs`,
`tasks.mjs`, `notifications.mjs` — wired together by `state.mjs` (`createStore`).
`provider.mjs` (`createCalendarProvider`) abstracts the calendar: mock mode is
in-memory, Nylas mode uses the real Hosted OAuth flow. Persistence is SQLite via
`better-sqlite3` (`database.mjs`); `seed.mjs`/`seed-users.mjs` seed on first run.

**Key domain concepts:**
- A *booking link* has a slug and belongs to a client.
- *Callers* are BeeNice employees who book meetings for prospects.
- *Reps* are the client's sales reps who receive the booked meetings.
- *Routing* assigns reps via weighted round-robin by percentage per rep. See
  `CONTEXT.md` for the decision record.
- *Availability* is computed live from rep calendar connections, existing bookings,
  and 15-min buffers before/after each booking.
- Slot invalidation is pushed across open tabs via SSE (`/api/book/:slug/stream`).
- Booking status is an immutable history (`booking_status_history`); the current
  status is the latest entry.

## Conventions

- TypeScript: no `any` without a justification comment (prefer `unknown`); named
  exports only; explicit return types on exported functions; import order
  external → internal (`@mvp/`, `@shared-*`) → relative.
- Naming: files kebab-case; types/components PascalCase; functions/vars camelCase;
  constants SCREAMING_SNAKE_CASE.

## Working notes

- Prefer existing repo patterns and local helpers over new abstractions.
- Keep MVP behavior inside `mvp/`; keep `src/` to shared UI primitives.
- Frontend API calls go through `mvp/src/lib/api.ts` (rely on the Vite proxy).
- Don't edit seeded SQLite data as a source of truth — change seed/state logic.
- When touching booking, availability, routing, calendar-provider, or status-history
  behavior, add focused coverage for the affected path.
- `company_size` routing is intentionally hidden from the default template. Do not
  re-expose it without an explicit instruction.
</content>
</invoke>

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
