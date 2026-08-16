---
applyTo: "backend/**"
---

# Backend conventions

## Database migrations (Alembic)

These rules are enforced statically by
`backend/scripts/check_migrations.py` (run in pre-commit and CI, or
directly with `python backend/scripts/check_migrations.py --all`). The
pre-launch history was squashed into a single compliant baseline
(`878bc9300d4f`), so the allow-list is now empty and every migration —
the baseline included — is held to the full standard below.

### Creating migrations

- Always create migrations with `just migrate "description"` — never run
  `alembic revision` by hand. The recipe upgrades to head, autogenerates
  against the models, then upgrades again so the new revision is applied.
- Every migration needs a real docstring summary and a meaningful slug.
  Bare `<rev>_.py` files (no description) are rejected.
- Keep the chain linear: exactly one base and one head, with no branches
  (a reused `down_revision`) and no cycles.
- Every migration must ship a real `downgrade()` — an empty, `pass`-only,
  or missing body is rejected. If a change is genuinely irreversible, say
  so explicitly rather than leaving `downgrade()` blank.

### Expand-contract and NOT NULL columns

- Prefer additive, backwards-compatible changes. Adding a NOT NULL column
  to an existing (populated) table in a single step will fail on live
  data.
- Any `add_column` / `alter_column` that sets `nullable=False` must also
  pass `server_default=` in the same call, so existing rows are valid
  immediately. Backfill real values with an explicit `UPDATE`, then tighten
  in a later migration if the server default should be dropped.

### Renaming tables and matching indexes

- Postgres does **not** rename a table's auto-named indexes when the table
  is renamed. `op.rename_table("old", "new")` leaves an index called
  `ix_old_col` in place, so autogenerate will forever flag it against the
  model's expected `ix_new_col`. When you rename a table, add a matching
  `op.execute("ALTER INDEX ix_old_col RENAME TO ix_new_col")` (reversible,
  lock-light, no rebuild). The squashed baseline already creates the index
  with its correct British-spelling name (`ix_organisations_name`) from the
  start.

### Partial and expression indexes in models

- A partial or expression index created in a migration (e.g.
  `postgresql_where=`) must also be declared in the model metadata as an
  `Index(...)` with the same predicate, otherwise autogenerate cannot see
  it and repeatedly proposes to drop it. Example:
  `ix_site_staff_one_clinical_lead` is declared on the `site_staff_member`
  table in `models.py`.
- Declare the predicate for **both** dialects — `postgresql_where=` *and*
  `sqlite_where=`. The unit-test database is SQLite, built from the model
  metadata via `create_all()`, and `postgresql_where` is silently ignored
  there — so a partial unique index would collapse into a **full** unique
  index and reject rows the predicate was meant to exclude. SQLite supports
  partial indexes, so `sqlite_where` restores the intended behaviour.

### Destructive changes

- `drop_column`, `drop_table`, and `drop_constraint` are separate,
  deliberate contract migrations — not bundled with additive work.
- The checker requires an explicit `# migration-check: allow-destructive`
  marker in any migration whose `upgrade()` performs a destructive
  operation, to force expand-contract deliberateness.

### Autogenerate-drift CI check

- The `alembic_drift_check` CI job (`.github/workflows/ci.yml`, fast tier)
  runs `alembic upgrade head` then `alembic check` against a real,
  ephemeral Postgres service container, and fails the build if autogenerate
  would still produce any operations — i.e. a model changed but no
  migration was written for it.
- This needs a real Postgres: SQLite unit tests build their schema straight
  from model metadata (`conftest.py`'s `create_all()`) and never exercise
  Alembic's autogenerate comparison, so it cannot live in the DB-less `unit`
  matrix task.
- Regression-tested in `backend/tests/test_alembic_check.py`
  (`@pytest.mark.integration` — excluded from the normal `just ub` / `unit`
  CI task; run explicitly against a migrated Postgres, as the
  `alembic_drift_check` job does).

### Renaming or retiring a column

- A rename (e.g. `body` -> `content`) is a copy-and-retire spread across
  several deploys, not a single migration — the old and new app revisions
  run concurrently against one schema, so a same-deploy rename breaks the
  still-serving old revision. Sequence it across separate deploys:
  1. **Expand** — add the new column, nullable; deploy an app that writes
     both columns but still reads the old one.
  2. **Backfill** — batched `UPDATE ... SET new = old WHERE new IS NULL`
     for existing rows (dual-write from step 1 covers rows that change
     during the migration).
  3. **Switch reads** — deploy an app that reads the new column (still
     writing both).
  4. **Contract** — deploy an app that stops writing the old column, then
     drop it in its own migration (`allow-destructive` marker required).

### Deploy and configuration notes

- Migrations run on deploy (`alembic upgrade head` in the container
  entrypoint), so a failing migration is a failed deploy. Test migrations
  locally before pushing.
- Manual traffic pinning / rollback is only guaranteed safe to the
  **immediately preceding** revision — expand-contract compatibility is
  pairwise-adjacent, not transitive across a gap. Before pinning back further
  than one revision, check whether any destructive/contract migration (a
  `drop_column`/`drop_table` completing an earlier rename, etc.) has shipped
  since the target revision; if so, the older code may reference a column or
  table that no longer exists.
- `compare_server_default` is deliberately **off** in `env.py` (only
  `compare_type=True` is enabled). Server-default drift is therefore not
  autodetected — manage column server defaults explicitly in migrations
  rather than relying on autogenerate to catch them.
