---
name: beenice-resume
description: Load BeeNice Calendar project state at the start of a session. Reads docs/project/ (TODO.md entrypoint, then ARCHITECTURE.md / LOG.md / wiki as needed) so a fresh agent resumes with current goal, state, and next action. Invoke FIRST at session start before working on this project. The repo-local equivalent of adam-vault, rooted at docs/project/ instead of the Obsidian vault.
---

# BeeNice — Resume

Load the project's current state from `docs/project/` — the authoritative, committed
source of truth for BeeNice Calendar. Invoke this at the start of any session before
touching the code.

This is the **read** path. The **write** path at end of work is `beenice-handoff`. Both
defer to one spec: **[references/project-structure.md](references/project-structure.md)** —
read it before touching any file under `docs/project/`.

## Resume (cold start)

1. Read **`docs/project/TODO.md`** — `## Resume` gives goal, current state, next action,
   and the run command; `## Checklist` gives what's left (done vs. remaining). That one
   file is usually enough to proceed.
2. Read **`docs/project/ARCHITECTURE.md`** when you need the code map before changing
   structure, routes, persistence, the calendar provider, or cross-module contracts.
3. Follow `[[wikilinks]]` only for depth — `docs/project/wiki/` (routing-design,
   microsoft-enterprise-auth, nylas-microsoft-oauth, …), `LOG.md` for the *why* behind a
   decision, `CONTEXT.md` at the repo root for domain terms.
4. Never reconstruct state from chat history or dated files — `TODO.md` is authoritative.

## Boundaries

- `docs/project/` is the **sole** project-tracking target for this repo. Do not read or
  write the Obsidian vault from here — the global `handoff` skill owns the vault; these
  project skills own `docs/project/`.
- Code, commits, and specs live in git. `docs/project/` holds *why, where, next* — don't
  duplicate code into it.

## Navigate

```bash
ROOT="docs/project"
grep -rln "agents" "$ROOT" --include="*.md"   # agent-tagged notes
grep -rl "keyword" "$ROOT" --include="*.md"    # by content
```
