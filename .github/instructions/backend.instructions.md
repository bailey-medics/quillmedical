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

- Migrations run as a **separate pre-deploy Cloud Run Job**
  (`quill-admin-{env}`, `ADMIN_ACTION=run-migrations` in
  `backend/scripts/admin_cli.py`), executed with `--wait` by `deploy.yml`
  before the new backend revision is created — not inside the serving
  container's entrypoint. A failing migration blocks the deploy rather than
  crash-looping the service. Test migrations locally before pushing.
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
- `env.py` sets `lock_timeout = 3s` and `statement_timeout = 30s` at the
  start of `run_migrations_online`, so a migration that cannot acquire its
  table lock quickly fails fast (and rolls back cleanly, thanks to
  transactional DDL) instead of queueing behind a long-running query and
  stalling all traffic to that table.

## API compatibility (expand-contract)

Mirrors the database expand-contract rule above, applied to the API
boundary: a stale client (mid rolling-deploy, or a tab left open for days)
depends on the current response/request shape for as long as it stays open.

### Additive-only within the compatibility window

- Adding an optional response field is safe. Renaming, removing, or
  retyping a field, or adding a **required** request field, is a breaking
  change and must never ship as a single deploy.
- Stage it as two deploys, at least one release apart:
  1. **Expand** — the new shape goes live alongside the old one; both are
     served simultaneously, so a stale client keeps working unchanged.
  2. **Contract** — the old shape is removed, **at least one full release
     cycle later** ("N releases" of deprecation) — never in the same deploy
     as the expand step.

### Enforcement: `oasdiff` + a required-reviewer environment gate

- `backend/scripts/dump_openapi.py` generates the OpenAPI spec used to diff
  `main` against the PR branch. The `api_breaking_change_check` CI job
  (`.github/workflows/ci.yml`) runs `oasdiff breaking` on the two specs and
  fails the build on any undeclared breaking change.
- The **only** way to declare a breaking change intentional is a required
  reviewer approval on the GitHub Actions environment
  `api-breaking-change-review` — never a code comment, commit-message
  trailer, or PR label. Those are just text/metadata an AI coding agent
  produces as routinely as the code itself, so none of them prove a human
  actually decided the change was intentional.
- A breaking-change finding posts to Slack (`channel: teaching`, via the
  reusable `.github/workflows/slack-notify.yml`) with `oasdiff`'s changelog
  summary, so the approval prompt shows *what* is being confirmed rather
  than a bare "approve?".

### Decision files: `api-compatibility/` folder

- Every `oasdiff`-flagged breaking change also needs a YAML decision file
  under `api-compatibility/` at the repo root recording the
  `forces_reload` verdict for that change — not a substitute for the
  environment approval above, an addition to it. The file itself can be
  drafted with LLM help like any other content; the actual human-only
  gate is the `api-breaking-change-review` required-reviewer environment
  approval, a distinct GitHub Actions UI/app action nothing in the diff
  can satisfy. Coverage is enforced by CI
  (`.github/scripts/ci/validate-compat-files.sh`): every flagged change
  (by exact `id`+`operation`+`path`+`text`) must have a matching file, or
  the build fails. Two properties removed from the same endpoint are two
  separate flagged changes and need two separate files.
- Create a YAML file with `python backend/scripts/new_compat_decision.py` — it
  prompts for the exact oasdiff change string (copy verbatim from the CI
  log) and whether the change needs a forced reload of open tabs
  (interactive `y`/`n` prompt, written to the file as boolean
  `forces_reload: true`/`false`), plus a reason, then writes
  `api-compatibility/YYYYMMDDHHMMSS-<slug>.yaml` with an auto-computed
  `generation` number.
- `forces_reload: true` means every open browser tab is incompatible and
  must reload immediately (bumps the shared `Compat-Generation` value,
  triggering the client's forced-reload overlay); `forces_reload: false`
  means the existing silent background-update mechanism (hourly timer or
  navigation) is sufficient — this covers the vast majority of changes
  (additions, deprecations, optional-field removals).
- Once merged, a decision file's `generation`, `forces_reload`, and
  `change` fields are immutable — never edit them retroactively, and
  never delete a file. If a decision is superseded, add a new file
  instead. Only `reason` may be edited later, via the same
  `api-breaking-change-review` gate.
- Full detail: `docs/docs/backend/api-compatibility.md` (why this exists,
  the client-side forced-reload mechanism, the `Compat-Generation`
  header).
