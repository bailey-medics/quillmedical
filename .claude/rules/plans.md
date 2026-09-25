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
- **Overview**: one or two paragraphs immediately under the title,
  before the first phase — explain _why_ the change is needed (the
  problem, risk, or need it addresses) and what the intended outcome
  is. Don't jump straight into tasks without this. Two paragraphs is
  the ceiling, not the target: the detail belongs in the steps, and an
  overview that grows past this is usually explaining something twice.
- **Phases**: break the work into `## Phase N: <name>` sections, each a
  checklist of concrete, actionable steps:
  ```markdown
  - [ ] Do the thing, in `path/to/file.py`
  - [x] Already-completed step
  ```
  Check items off (`- [x]`) as work completes — a plan file is a living
  record of progress, not a one-time proposal. Do not delete completed
  phases; leave them checked for history.
- **No tables.** Markdown tables are unreadable in raw form — the cells
  wrap, the columns stop lining up, and the plan can only be scanned in
  a rendered preview. Use bullets for anything a table would hold:
  ```markdown
  - **The thing** — what it is, and why it matters.
  - **The other thing** — same shape, one bullet each.
  ```
  Put the label in bold, then an em dash, then the prose. Separate
  bullets with a blank line when each runs to more than a line or two.
- **Decisions** (optional, include when there are non-obvious
  trade-offs): a `## Decisions` section, one bullet per decision in the
  form above. The rationale explains _why_, not just what.
- **Register new plans** in `docs/docs/plans/index.md` — add a link in
  the same list, roughly in date order.
- Prefer reusing patterns/utilities already documented in nearby plans
  over inventing new structure — skim 1-2 recent plans for tone and
  section depth before writing a new one.

## Write it in implementation order, and keep it that way

The plan is read afterwards by somebody reconstructing what happened,
so its order is part of its content.

- **Order the phases and steps the way the work should actually be
  done**, not by topic and not by which part is easiest to describe.
  A step that must land in its own deploy, or that unblocks three
  others, belongs where its timing says it does.
- **Follow the plan in the order it is written.** If the order turns
  out to be wrong, that is a finding about the plan: **change the
  order in the document**, then carry on. Do not work out of order
  while leaving the file describing a sequence nobody followed.
- **The test**: someone reading the finished document top to bottom
  should see the work in the order it was done. If they would not,
  the document is out of date, not the memory of it.

## Explain each step inside its own checkbox

- **Put the reasoning, research and file paths in the step itself**,
  not in a separate overview or background section that the steps then
  repeat. A reader meets each decision once, at the point it matters.
- **A step can run to a paragraph or two** where the reasoning earns
  it. Long is fine; saying the same thing in two places is not.
- **Do not pair a "what we found" section with a "what we will do"
  section** covering the same ground. That split is what makes a plan
  twice as long to read as it needs to be, and it is the most common
  failure here.
- **`## Decisions` stays separate, and does not repeat a step.** It is
  for trade-offs that span the plan or were deliberately deferred —
  the things somebody will later ask "why did you do it that way?"
  about. Where a decision belongs to one step, it lives in that step.

## Plans that change how people move around the app

A plan that changes a layout, the top ribbon, the navigation or the login
flow ends with a step naming which of the accessibility journeys in
`docs/docs/frontend/accessibility/journeys.md` it touches, and adding
them to the "Not yet run" list in `testing-log.md`. Those four areas are
what every journey passes through, and the automated checks cannot tell
whether a screen reader user can still get through them. Manual
screen reader testing is deferred until a DTAC sign-off needs it, so the
list is what tells that round what to re-run.
