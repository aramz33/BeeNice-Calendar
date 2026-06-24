---
tags: [agents]
status: ready-for-agent
labels: [routing, percentage-round-robin]
created: 2026-05-04
updated: 2026-06-24
repo: aramz33/BeeNice-Calendar
---

# Percentage Round-Robin Routing — design

The three open questions are **resolved** (Julien, 2026-06-24). This is the spec for Phase 2.

## Decided (2026-06-24)

1. **Who sets the %?** The **admin** (Julien/Camille) sets it on the connexion/settings page per client. Reps do **not** choose their own %. New client → creation form generates a link → reps connect → routing balances automatically; admin can re-weight afterward.
2. **Totals must always sum to 100%**, computed dynamically and persisted.
3. **`weighted_seniority` does not survive.** No role weighting. Percentage is the only model; default balanced. (`pool_unique`'s fate: fold into percentage-all-flexible — confirm during impl.)

## The model — fixed / flexible (lazy)

One nullable column: **`reps.weight_pct REAL NULL`**.
- `NULL` = **flexible** — auto-balances.
- a number = **pinned** by the admin.

**Effective %** = pinned reps keep their pinned value; flexible reps split `(100 − Σ pinned) ÷ count(flexible)`, computed **live, never stored**. Storing only the pins means it cannot drift and nothing recomputes on rep connect/disconnect — the formula just re-runs.

Examples (match Julien's mental model):
- All flexible → each `100/N`, adjusts as reps connect. Zero admin action.
- Pin rep1=40 → others split 60.
- Pin rep1=40, rep2=40 → rep3–5 split 20 → 6.67% each.

The fixed/flexible "type" is just *is `weight_pct` null or set* — no separate type field needed.

### Guards (the problem in the raw logic)
Pinned %s can over-allocate. Validate on save:
1. `Σ pinned > 100` → reject.
2. All reps pinned and `Σ ≠ 100` → no flexible rep to absorb → block/normalize.
3. `Σ pinned = 100` with flexible reps present → they get 0% (benched). Valid, but warn in UI.

Routing uses float weights (33.33% is fine for the deficit algo); round only for display.

## Architecture decisions

- **Per-rep weight lives on the `reps` table** as `weight_pct REAL NULL` (null = flexible). One value per rep, scoped to their client; reps can't have different weights across booking links.
- **`weighted_seniority` is removed.** Drop the role-based deficit path; `routing_policies` (`companySizeThreshold`/`seniorWeight`/`juniorWeight`) is no longer needed for routing — migrate/retire it.
- **All connected, active reps are eligible** — no company-size filtering. `getEligibleReps` collapses to "active reps for the link".
- **Deficit algorithm** — `(total + 1) * effectiveWeight - rollingCount` per available rep; pick highest deficit. `effectiveWeight` is the computed fixed/flexible fraction (see model above).
- **Routing module is a pure function** — `selectRep(availableReps: RepWithLoad[], policy) → { rep, reason }` where `RepWithLoad` = rep + `rollingCount` + `effectiveWeight`; caller fetches rolling counts + computes effective weights before invoking, so the module has no DB dependency.

## What's left to build (resume here)

1. Migration: add `reps.weight_pct REAL NULL`; retire `routing_policies` role columns.
2. `effectiveWeight` helper: pinned kept, flexible split the remainder; the 3 save-time guards above.
3. Strip `weighted_seniority`/company-size from `getEligibleReps` + `assignRep` in `availability.mjs`.
4. Admin connexion/settings UI: per-rep % field per client group (pin = set value, clear = back to flexible), live preview of the computed split.
5. Write the pure `selectRep` + test in isolation (balanced default, pinned mix, benched-flexible edge).

## Relevant files

- `mvp/server/lib/availability.mjs` — `assignRep` (line 324), `getEligibleReps` (line 232), `getRollingCounts` (line 211) — all routing logic lives here currently
- `mvp/server/lib/state.mjs` — `getRoutingPolicy`, `getClient`, `getRep`, `getRepsForLink` — data access routing depends on
- `mvp/server/lib/persistence.mjs` — `routing_policies` table queries
