---
paths:
  - "docs/docs/plans/**"
---

# Plan conventions

- **Filename**: `YYYY-MM-DD-<kebab-case-slug>.md`, dated the day the plan
  is created — e.g. `2026-08-25-core-db-auto-commit-plan.md`. End the
  slug in `-plan`.
- **Title**: a single `#` heading in sentence case, matching the slug
  (e.g. `# Core DB auto-commit plan`).
- **Context paragraph**: immediately under the title, before the first
  phase — explain *why* the change is needed (the problem, risk, or
  need it addresses) and what the intended outcome is. Don't jump
  straight into tasks without this.
- **Phases**: break the work into `## Phase N: <name>` sections, each a
  checklist of concrete, actionable steps:
  ```markdown
  - [ ] Do the thing, in `path/to/file.py`
  - [x] Already-completed step
  ```
  Check items off (`- [x]`) as work completes — a plan file is a living
  record of progress, not a one-time proposal. Do not delete completed
  phases; leave them checked for history.
- **Decisions table** (optional, include when there are non-obvious
  trade-offs): a `## Decisions` section with a two-column
  `| Decision | Rationale |` table. One row per decision, rationale
  explains *why*, not just what.
- **Register new plans** in `docs/docs/plans/index.md` — add a link in
  the same list, roughly in date order.
- Prefer reusing patterns/utilities already documented in nearby plans
  over inventing new structure — skim 1-2 recent plans for tone and
  section depth before writing a new one.
