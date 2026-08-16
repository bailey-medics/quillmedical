# Alembic migration safety

## Overview

Database migrations run **automatically on every deploy**
(`backend/docker/entrypoint.sh` runs `alembic upgrade head`, retries five
times, then exits). A failed migration therefore crash-loops the new
container — migration safety is a deploy-availability concern, not just
tidiness. This page explains the mechanics that keep that safe, and the
tooling that enforces the rules automatically rather than relying on human
review alone.

Only the **core database** is migrated by Alembic. HAPI FHIR and EHRbase
manage their own schemas and are out of scope.

## How a deploy stays safe: rolling revisions + expand-contract

During a deploy, Cloud Run keeps the **previous** revision serving 100% of
traffic while the **new** revision boots — the new revision only receives
traffic once it reports healthy. Migrations run inside that new revision's
startup, so for a window both revisions' code exists, but only the old one
is actually live.

- **PostgreSQL's transactional DDL is what actually prevents a stuck
  half-migrated database.** `env.py` runs `alembic upgrade head` as a single
  transaction. If any migration in the batch fails, Postgres rolls back the
  whole batch — the database is left exactly at the pre-deploy revision, and
  the old revision keeps serving against the schema it already understands.
  There is nothing to downgrade.
- **The residual risk is a migration that succeeds but isn't
  backward-compatible** — e.g. a `RENAME` or `DROP COLUMN` still read by the
  old, still-serving revision. This is why every migration must follow
  **expand-contract**: only ever _add_ things the old app can ignore (new
  columns nullable or defaulted); never rename or drop something still in
  use. The destructive half (dropping the superseded column) ships as a
  **separate, later** migration, once no serving revision needs the old
  shape.
- We deliberately run a **roll-forward** posture — no automatic `downgrade`
  on deploy failure. Cloud Run already protects availability (the old
  revision keeps serving), and a downgrade that drops a column is
  destructive regardless, so there's nothing a downgrade buys us over
  fixing forward.

## Layer 1 — static checks on every migration (`check_migrations.py`)

`backend/scripts/check_migrations.py` is a pure-stdlib (`ast`, `pathlib`)
script with no database access and no import of the `app` package, so it's
safe to run in a pre-commit hook. It parses every
`backend/alembic/versions/*.py` file and checks:

1. **Chain integrity** — exactly one base and one head; no reused
   `down_revision` (a branch); no cycles.
2. **Non-empty description** — the module docstring must carry a real
   summary, not a bare `<rev>_.py` slug.
3. **Reversibility** — `downgrade()` must not be empty, `pass`-only, or
   missing. A new migration with no real downgrade body is a hard failure.
4. **The NOT NULL trap** — any `add_column` / `alter_column` that sets
   `nullable=False` must also pass `server_default=` in the same call, so
   existing rows stay valid the instant the migration commits.
5. **Destructive ops** — `drop_column` / `drop_table` / `drop_constraint` in
   `upgrade()` require an explicit `# migration-check: allow-destructive`
   marker, forcing expand-contract to be a deliberate choice, not an
   accident.

The pre-launch migration history was squashed into a single baseline
(`878bc9300d4f`) before go-live, so there is no allow-list of grandfathered
revisions — every migration, including the baseline, meets the full
standard. Run it directly with:

```bash
python backend/scripts/check_migrations.py --all
```

It also runs automatically as a local pre-commit hook (`check-migrations` in
`.pre-commit-config.yaml`, scoped to `backend/alembic/versions/*.py`), so it
rides the existing `pre-commit run --all-files` CI step for free — no
separate CI job is needed for this layer.

## Layer 2 — catching drift between models and migrations (`alembic check`)

The static checker above only looks at the migration files themselves — it
cannot tell you whether a SQLAlchemy model changed **without** a matching
migration being written for it. That's a real, easy-to-make mistake: edit
`models.py`, forget to run `just migrate`, and the deployed schema silently
diverges from what the ORM expects.

Alembic ships a built-in command for exactly this: `alembic check` runs the
same autogenerate comparison used by `alembic revision --autogenerate`, but
against the **already-migrated** database, and fails if it would still
generate any operations.

```bash
alembic upgrade head
alembic check   # exits non-zero if the models and migrations have diverged
```

### Why this needs a real Postgres, and its own CI job

Backend unit tests build their schema straight from model metadata via
SQLite's `create_all()` (see `backend/tests/conftest.py`) — fast, but it
never touches Alembic's migration chain at all, so it cannot exercise this
comparison. The check needs a database actually migrated through the real
chain, on the same engine (PostgreSQL) the migrations were written for.

CI runs this as its own small, fast-tier job — `alembic_drift_check` in
`.github/workflows/ci.yml` — with an ephemeral Postgres **service
container**. It stays in the **fast tier** (runs on every push, not just
non-draft PRs) because the bug it catches — a model change with no
migration — is per-change, and a Postgres service container boots in
seconds, nowhere near the minutes that define the heavy tier. It runs on
**every** backend push, not gated on "did a migration file change" — the
exact case it exists to catch is a PR that changes a model but adds **no**
migration file, so gating on that filter would skip the one case that
matters.

The job:

1. Boots a Postgres service container.
2. `alembic upgrade head` against it.
3. `alembic check` — the actual gate; a non-empty diff fails the job.
4. Runs `backend/tests/test_alembic_check.py` (marked
   `@pytest.mark.integration`, so it's excluded from the normal
   `just ub` / `unit` CI task) as a regression test: one test asserts a
   freshly migrated database has no drift; the other temporarily registers
   an extra table in `Base.metadata` (simulating an unmigrated model
   change) and asserts `alembic check` raises
   `alembic.util.exc.AutogenerateDiffsDetected`.

## `compare_server_default` is deliberately off

`env.py` enables `compare_type=True` (autogenerate notices column type
changes) but leaves `compare_server_default` at its default (off). This is a
deliberate trade-off: at our current scale, server-default comparisons
produce recurring false positives (e.g. Postgres normalising a default
expression's text) that outweigh the benefit of auto-detecting genuine
drift, and there are few enough server defaults in play that they're managed
explicitly in migrations instead.

## Related

- [Alembic review and migration safety plan](../plans/2026-08-09-alembic-review-plan.md) —
  the full review, decision log, and implementation tracker this page
  summarises.
- [Alembic migrations squash plan](../plans/2026-08-11-migrations-squash-plan.md) —
  the pre-launch history squash referenced above.
- `.github/instructions/backend.instructions.md` — the enforceable rules an
  AI coding agent (or human) sees automatically when touching `backend/**`.
