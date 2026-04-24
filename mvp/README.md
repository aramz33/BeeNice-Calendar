# Be Nice MVP

Standalone MVP built under `mvp/` so the original prototype stays untouched.

## What it includes

- Caller workspace at `/book/teamstarter-discovery`
- Admin bookings console at `/admin/bookings`
- Local Node API with:
  - SQLite persistence on disk
  - seeded clients, callers, reps, bookings
  - live availability computation
  - weekly availability navigation over a 12-week booking window
  - weighted routing with company-size qualification
  - immutable status history
  - SSE slot invalidation
  - mock calendar mode and Nylas-ready provider scaffolding

## Run

```bash
npm run dev
```

This starts:

- API: `http://localhost:8787`
- Web app: `http://localhost:5174`

By default the server persists its state in:

```text
mvp/server/data/mvp.sqlite
```

You can override it temporarily:

```bash
MVP_DB_PATH=/tmp/benice-mvp.sqlite npm run dev
```

## Calendar provider mode

By default the MVP runs in mock calendar mode:

```bash
MVP_CALENDAR_PROVIDER=mock npm run dev
```

To test the Nylas connection flow, set at least:

```bash
MVP_CALENDAR_PROVIDER=nylas
MVP_NYLAS_API_KEY=...
MVP_NYLAS_CLIENT_ID=...
MVP_NYLAS_CALLBACK_URL=http://localhost:8787/api/admin/integrations/nylas/callback
```

Then start:

```bash
npm run dev
```

The admin console exposes a minimal rep connection card so you can launch Hosted OAuth per rep.

## Local staging mode

Build the frontend, then serve the compiled app and the API from the same Node
process:

```bash
npm run build
npm run start
```

This is the recommended mode for validating Nylas callbacks locally or on a
single staging origin.
