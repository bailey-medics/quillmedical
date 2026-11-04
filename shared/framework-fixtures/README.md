# Framework fixtures

The frameworks the tests and the end-to-end stack sync from, so no test
depends on a publisher's framework repository or on the frameworks still
living in `shared/competency-definitions/`.

Each file is a framework file in the shape a framework repository holds,
copied from `shared/competency-definitions/` on 4 November 2026 at
version 1. They are fixtures: they need not follow the real frameworks
when those change, and a test that names a competency here names a
fixture.

Read by:

- **`stored_frameworks`** in `backend/conftest.py`, which syncs them
  into a test's tables.
- **`files_catalogue`** in `backend/tests/frameworks.py`, for a test that
  never touches the database.
- **`backend/scripts/seed_ci.py`**, which fills the end-to-end stack's
  tables from them.

See Phase 7 of
`docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md`.
