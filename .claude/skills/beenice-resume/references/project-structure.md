# BeeNice project-folder standard

The contract for `docs/project/` — the authoritative, committed state of the BeeNice
Calendar project. One entrypoint, rolling vs append-only, agent-first plain text,
reference-don't-copy. Both `beenice-resume` (read) and `beenice-handoff` (write) defer to
this file. Self-contained in the repo so any agent or teammate can follow it without
external skills.

## Layout — `docs/project/`

| path | role | lifecycle |
|---|---|---|
| `HOME.md` | index / catalog → points to `TODO.md` first | stable, edited rarely |
| `TODO.md` | entrypoint: `## Resume` + `## Checklist` | **rolling — overwritten in place each session** |
| `LOG.md` | append-only history + decision rationale | **append-only — never rewritten** |
| `ARCHITECTURE.md` | stable technical map: modules, routes, data model, key flows | updated when code shape changes |
| `wiki/` | deeper coding/functional context, own `index.md` | as-needed |
| `_archive/` | superseded notes, out of flow | frozen |

No empty scaffolding. The rolling-vs-append split is the rule that kills handoff sprawl:
no dated `handoff-*.md` copies — state lives in `TODO.md` (always current), history in
`LOG.md` (never lost).

## Frontmatter

`TODO.md` / `LOG.md` keep:
```yaml
---
tags: [domaine/pro, projet/beeniche, type/todo, agents]
updated: YYYY-MM-DD   # TODO.md only — the rolling timestamp
---
```
Keep the `agents` tag so agent-facing notes stay discoverable. Notes use Obsidian-style
`[[wikilinks]]` (path-independent; render as plain text on GitHub). No Dataview/Bases in
anything an agent reads raw.

## Checklist granularity

L1 milestone → L2 verifiable action (`→ verify:` on each) → L3 only if botch-prone.
Markers: `[x]` done · `[ ]` todo · `[~]` in progress · `[→]` blocked/delegated.
Decisions ride as indented context lines on the item they shaped. The *why* goes in
`LOG.md`, not here — `TODO.md` stays scannable.

## Read / resume protocol

1. Open `docs/project/TODO.md`. `## Resume` gives goal, state, next action, run command.
   `## Checklist` gives what's left. Proceed from there.
2. Open `docs/project/ARCHITECTURE.md` when you need the code map before changing
   structure, routes, persistence, providers, or cross-module contracts.
3. Follow `[[wikilinks]]` only for depth: specs, `wiki/`, `LOG.md` for the *why*.
4. Never reconstruct state from chat history or dated files — `TODO.md` is authoritative.

## Write protocol (end of session)

1. **Rewrite `TODO.md` in place.** Refresh `## Resume`, flip checklist markers, add/remove
   items, bump `updated:` to today. Overwrite — never create a dated copy.
2. **Append one `LOG.md` entry** (newest at top, under the header). What changed and *why*:
   decisions, rationale, risks, commit refs. Never edit past entries.
3. **Update `ARCHITECTURE.md` when the code shape changed** — modules, routes, schema,
   providers, runtime topology, major data flows.
4. **Reference, don't copy.** Point at commits/specs by hash or `[[wikilink]]`. Redact
   secrets. The folder holds why/where/next; git holds the code.

## Lint

- [ ] `TODO.md` has `## Resume` + `## Checklist`, `updated:` is today.
- [ ] `LOG.md` append-only, newest entry on top.
- [ ] `ARCHITECTURE.md` reflects current code shape.
- [ ] `HOME.md` first row links `[[TODO]]`.
- [ ] No dated `handoff-*.md` at the root.
- [ ] Links resolve; no duplicated code/specs the folder should only reference.
