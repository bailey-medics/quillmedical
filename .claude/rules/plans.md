---
paths:
  - "docs/docs/plans/**"
---

# Quill's additions to the plans rule

These add to the shared `plans.md` rule in Mark's mark-house-style
repository, which sets how every plan is written. Read the two together.
In Quill, the build skill is `/f`, the interview is `/g` and the plan
writer is `/p`.

- **Plans live in `docs/docs/plans/`**, and the docs site publishes them.
- **Register new plans** in `docs/docs/plans/index.md`: add a link in the
  same list, roughly in date order.
- **Phase 1 deploys on its own.** Merging to `main` deploys to App
  production with no further gate, which is why Phase 1 must be safe to
  be live.

## Plans that change how people move around the app

A plan that changes a layout, the top ribbon, the navigation or the login
flow ends with a step naming which of the accessibility journeys in
`docs/docs/frontend/accessibility/journeys.md` it touches, and adding
them to the "Not yet run" list in `testing-log.md`. Those four areas are
what every journey passes through, and the automated checks cannot tell
whether a screen reader user can still get through them. Manual
screen reader testing is deferred until a DTAC sign-off needs it, so the
list is what tells that round what to re-run.
