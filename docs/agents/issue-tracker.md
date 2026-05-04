# Issue Tracker: Obsidian Markdown

Issues and PRDs for this repo live as markdown files in the external Obsidian vault folder:

`/Users/aramsis/Library/Mobile Documents/iCloud~md~obsidian/Documents/Adam's Vault/6 - Main Notes/BeeNice/issues`

## Conventions

- One issue per markdown file in the issues folder.
- Use frontmatter for machine-readable state.
- Triage state is recorded in `status` using the strings in `triage-labels.md`.
- Comments and conversation history append under `## Comments`.
- If an Obsidian CLI is available, it may be used to open or create notes, but the markdown files are the source of
  truth.

## Issue Template

```yaml
---
status: needs-triage
labels: []
created:
updated:
repo: aramz33/BeeNice-Calendar
---
```

## When a skill says "publish to the issue tracker"

Create a markdown file in the Obsidian issues folder using a clear slugged filename.

## When a skill says "fetch the relevant ticket"

Read the referenced markdown file from the Obsidian issues folder.
