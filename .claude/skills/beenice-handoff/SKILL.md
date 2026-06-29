---
name: beenice-handoff
description: Compact the current BeeNice Calendar session into docs/project/ so a fresh agent can continue. Rewrites docs/project/TODO.md in place, appends one docs/project/LOG.md entry, and updates docs/project/ARCHITECTURE.md when the code shape changed. Invoke at the END of work on this project. The repo-local equivalent of the global handoff skill, but targets docs/project/ (NOT the Obsidian vault).
---

# BeeNice — Handoff

Compact this session so a cold agent can pick up the work. The **write** path for the
BeeNice project folder. Counterpart of `beenice-resume` (the read path). Both defer to one
spec — **[../beenice-resume/references/project-structure.md](../beenice-resume/references/project-structure.md)** —
do not invent a different format.

## Target

`docs/project/` in this repo is the **sole** target — the authoritative, committed state.
Do **not** write the Obsidian vault: the global `handoff` skill owns the vault; this skill
owns `docs/project/`. (The vault stays a human-synced mirror.)

## Steps

1. **Check current truth first** — `git status`, relevant test/build results, user-facing
   blockers. Don't write stale state.
2. **Rewrite `docs/project/TODO.md` in place** — refresh `## Resume` (goal, state, next
   action, run command), flip checklist markers, add/remove items, bump `updated:` to
   today. Overwrite; never make a dated copy.
3. **Append one dated `docs/project/LOG.md` entry** (newest on top, under the header) —
   what changed and *why*: decisions, rationale, risks, commit refs. Never edit past
   entries.
4. **Update `docs/project/ARCHITECTURE.md` when the code shape changed** — modules, routes,
   schema, calendar provider, runtime topology, or major data flows.

## Always

- **Reference, don't copy.** Point at commits/specs/wiki by hash or `[[wikilink]]` — the
  folder holds why/where/next; git holds the code.
- **Redact secrets** — API keys, passwords, PII.
- If the user passed an argument, treat it as the next session's focus and tailor
  `## Resume` accordingly.
- Lint against the spec's checklist before declaring done.
