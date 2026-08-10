---
applyTo: "backend/**"
---

# Backend conventions

## Database migrations (Alembic)

These rules are enforced statically by
`backend/scripts/check_migrations.py` (run in pre-commit and CI, or
directly with `python backend/scripts/check_migrations.py --all`). The
existing 35 revisions are grandfathered via an allow-list; every new
migration is held to the full standard below.

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
- Canonical example: `197844c56085` (add `email_verified` with a
  `server_default` and `nullable=False`, then backfill existing rows).

### Renaming tables and matching indexes

- Postgres does **not** rename a table's auto-named indexes when the table
  is renamed. `op.rename_table("old", "new")` leaves an index called
  `ix_old_col` in place, so autogenerate will forever flag it against the
  model's expected `ix_new_col`. When you rename a table, add a matching
  `op.execute("ALTER INDEX ix_old_col RENAME TO ix_new_col")` (reversible,
  lock-light, no rebuild). Canonical example: `b66133f32f7b` (renames
  `ix_organizations_name` to `ix_organisations_name` after the `org002`
  table rename).

### Partial and expression indexes in models

- A partial or expression index created in a migration (e.g.
  `postgresql_where=`) must also be declared in the model metadata as an
  `Index(...)` with the same `postgresql_where`, otherwise autogenerate
  cannot see it and repeatedly proposes to drop it. Example:
  `ix_site_staff_one_clinical_lead` is declared on the `site_staff_member`
  table in `models.py`.

### Destructive changes

- `drop_column`, `drop_table`, and `drop_constraint` are separate,
  deliberate contract migrations — not bundled with additive work.
- The checker requires an explicit `# migration-check: allow-destructive`
  marker in any migration whose `upgrade()` performs a destructive
  operation, to force expand-contract deliberateness.

### Deploy and configuration notes

- Migrations run on deploy (`alembic upgrade head` in the container
  entrypoint), so a failing migration is a failed deploy. Test migrations
  locally before pushing.
- `compare_server_default` is deliberately **off** in `env.py` (only
  `compare_type=True` is enabled). Server-default drift is therefore not
  autodetected — manage column server defaults explicitly in migrations
  rather than relying on autogenerate to catch them.
