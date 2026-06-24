# Booking Status Contract

Canonical booking dispositions owned by the app. This is the source of truth that the
Google Sheet and Corentin's n8n bridge map against — the **app drives the vocabulary**,
the Sheet is made typed to match it. Translation between messy Sheet free-text and these
keys lives in n8n, never in the app.

## The six dispositions

| Canonical key   | French label  | Reposition task? | Notes |
|-----------------|---------------|------------------|-------|
| `completed`     | Honoré        | no               | Meeting took place. |
| `no_show`       | No-show       | **yes**          | Prospect absent → re-book. |
| `not_qualified` | Non qualifié  | no               | Out of ICP after discovery. Terminal. |
| `cancelled`     | Annulé        | **yes**          | Cancellation (schedule axis). |
| `mvn`           | MVN           | no               | Mauvais numéro (wrong number). Terminal. |
| `refused`       | Refus         | **yes**          | Prospect not available at that time → re-book. |

A booking also has transient lifecycle values `scheduled` / `rescheduled` (planned, not
yet an outcome) — these are not client dispositions and are not Sheet-mapped.

## Reposition trigger

Setting an outcome of `no_show` or `refused` spawns a `reposition_booking` follow-up task
for the original caller (`refused` = prospect not available at that slot → re-book).
`cancelled` (schedule change) also spawns one. `completed`, `not_qualified`, and `mvn`
(wrong number) are terminal — no task.

## Stability rules

- Keys are stable ascii identifiers; never store the French label or Sheet free-text in
  the DB.
- Adding a disposition is a contract change — update this file, `OUTCOME_STATES`
  (`mvp/server/lib/bookings.mjs`), `DISPLAY_STATUSES` (`mvp/server/lib/state.mjs`), the
  frontend `OutcomeState`/`DisplayStatus` unions (`mvp/src/lib/types.ts`), and notify
  Corentin so the n8n mapping stays in sync.

## Confirmed (Julien, 2026-06-24)

`MVN` (wrong number) is terminal — no reposition task. `Refus` means the prospect was not
available at that slot (not a hard no), so it **does** spawn a reposition task.
