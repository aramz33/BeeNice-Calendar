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

## Current Architecture Notes

- The runnable product lives under `mvp/`.
- The backend is a plain Node HTTP server with SQLite persistence.
- The frontend speaks only to `/api/*` routes and uses the backend response shapes in `mvp/src/lib/types.ts`.
- Availability and routing behavior should stay consistent between displayed slots, booking creation, and admin
  rescheduling.
