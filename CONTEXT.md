# BeeNice Calendar Domain Context

BeeNice Calendar is an MVP for booking discovery meetings between Be Nice callers and a client's sales reps.

## Domain Terms

- **Booking link**: A public workspace identified by a slug, owned by a client, with duration, interval, buffer, notice,
  timezone, and routing policy settings.
- **Caller**: A Be Nice employee using the public workspace to book or rebook meetings for prospects.
- **Rep**: A client's sales representative who can receive booked meetings when active and connected to the current
  calendar provider mode.
- **Routing**: The policy that chooses eligible reps for a booking link. In weighted seniority mode, large companies
  route to senior reps only; smaller companies use the full pool and weighted senior/junior balancing.
- **Availability**: The bookable slot set computed from booking link rules, rep eligibility, local busy events, existing
  bookings, provider busy intervals, and buffer times.
- **Calendar connection**: A rep's provider account state used to decide whether the rep can receive meetings and
  whether provider busy intervals can be read.
- **Follow-up task**: A caller task created when a booking needs repositioning after cancellation or no-show.
- **Status history**: Immutable booking status records and timeline events that explain booking creation, schedule
  changes, outcome changes, and follow-up task events.

## Business Context

- **First client**: BeeNice — a B2B sales-call outsourcing company (Julien BOUIC, Camille, Florian Caillet).
- **Distribution model**: Self-hosted. Each client deploys their own instance on their own VPS. BeeNice hosts on Hostinger (Germany).
- **Scale**: BeeNice has 5–6 active clients, 1–5 calendar connections each (~25 Nylas connections currently). Long-term vision: ~50 clients × 5 connections.
- **Future model**: SaaS mutualisé is a long-term option, not current scope.
- **Calendar provider**: Nylas (Google + Microsoft). Microsoft enterprise auth requires an Azure app registration.

## Key Product Decisions

| Decision | Choice | Reason |
|---|---|------|
| Routing v1 | Percentage-based round-robin per rep (e.g. 10/10/40/40) | BeeNice explicit requirement — replaces senior/junior fixed weights |
| Company size field | Hidden from default template | Only one BeeNice client needs it; keeps UI stable for all others |
| Custom fields routing | Not in V1 | Stability over flexibility; one client needs it, not the default |
| Client mirror view | Deferred | Explicitly put on standby by Julien BOUIC (2026-04-27 meeting) |
| Buffer | 15 min before + 15 min after every booking | Prevents back-to-back exhaustion; blocks adjacent slots visibly |

## Current Architecture Notes

- The runnable product lives under `mvp/`.
- The backend is a plain Node HTTP server with SQLite persistence.
- The frontend speaks only to `/api/*` routes and uses the backend response shapes in `mvp/src/lib/types.ts`.
- Availability and routing behavior should stay consistent between displayed slots, booking creation, and admin
  rescheduling.
- Routing logic lives in `mvp/server/lib/availability.mjs`. Routing policies are stored in the `routing_policies`
  table with `company_size_threshold`, `senior_weight`, and `junior_weight` columns — to be extended with per-rep
  weights for percentage-based round-robin.
- Buffer times are stored as `buffer_before_minutes` and `buffer_after_minutes` on `booking_links`. Default should
  be 15 min each.
