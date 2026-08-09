# Alembic review and migration safety plan

**Date:** 2026-08-09
**Status:** Review complete; plans below awaiting selection for implementation
**Scope:** `backend/alembic/` — reviewed during the backend human code review

A summary of everything found and proposed while reviewing the Alembic
migration setup. Findings are green unless stated. Plans are grouped as
**Agreed**, **Potential**, and **Decisions needed** so each can be picked
up or dropped independently.

## Context

- Migrations run **automatically on every deploy** via
  `backend/docker/entrypoint.sh` (`alembic upgrade head`, 5 retries, then
  `exit 1`). A failed migration therefore **crash-loops the container** —
  migration safety is a deploy-availability concern, not just tidiness.
- `env.py` migrates the **core DB only** (`Base.metadata` + an explicit
  import of teaching models). HAPI FHIR and EHRbase manage their own
  schemas and are deliberately out of scope.
- 34 migrations, one unbroken linear chain from base `49c5bacfa481`
  (init_auth_tables) to head `org002`.

## Completed during review

- **Removed orphan entrypoint** — deleted
  `backend/alembic/docker/entrypoint.sh` (and its now-empty folder). It was
  referenced by nothing; the live entrypoint is `backend/docker/entrypoint.sh`.
  The orphan was also the inferior version (swallowed migration failures with
  a warning and served anyway, vs the live one which retries then exits).

## Findings (no action required)

- **`env.py` is clean.** `compare_type=True` set in both offline and online
  paths; DB URL sourced from `settings.CORE_DATABASE_URL`; teaching models
  imported so autogenerate sees them.
- **Heads check: PASS.** Single base, single head (`org002`), no branches,
  no multiple heads, no cycles — `alembic upgrade head` is unambiguous.
- **Risk-signal scan: all clear.** Every `nullable=False` on an _existing_
  table is paired with a `server_default` (e.g. `197844c56085` even backfills
  existing rows to `true`). Every destructive `drop_*` is confined to a
  `downgrade()`. Data migrations (`50cac628e9c6`, `org002`) are safe with
  documented lossy downgrades where relevant. FK `CASCADE`->`RESTRICT`
  (`3f28ddb4031e`) is a clean drop+recreate with a mirrored downgrade.
- **The four `updates_for_mypy` migrations** tighten booleans to
  `nullable=False`. Safe here because those columns were already populated on
  all rows. Retained as the canonical _example_ of the one pattern that can
  break an auto-deploy (adding NOT NULL to an existing column with no default
  and un-backfilled NULLs).

## Agreed plans

### 1. `backend/scripts/check_migrations.py` — automated enforcement

Pure-stdlib (`ast`, `pathlib`), **no DB, no `app` import** so it is safe in
pre-commit. Parses every `backend/alembic/versions/*.py` and fails with a
clear message on:

1. **Chain integrity** — exactly one base and one head; no reused
   `down_revision` (branch); no cycles.
2. **Non-empty description** — module docstring present; reject bare
   `<rev>_.py` slugs.
3. **Reversibility** — `downgrade()` must not be empty/`pass`.
4. **NOT NULL trap** — any `add_column`/`alter_column` with `nullable=False`
   must also pass `server_default=` in the same call.
5. **Destructive ops** — `drop_column`/`drop_table`/`drop_constraint` in
   `upgrade()` require an explicit `# migration-check: allow-destructive`
   marker (forces expand-contract deliberateness).

Allow-list the existing 34 revisions so current history passes; hold new
migrations to the full standard. Runnable as
`python backend/scripts/check_migrations.py --all`.

### 2. `.github/instructions/backend.instructions.md` — documented rules

- **Location: repo-root `.github/instructions/`** (NOT nested under
  `backend/` — VS Code only auto-discovers root). Scope via frontmatter
  `applyTo: "backend/**"`, matching `just.instructions.md`.
- Content: Alembic expand-contract rules mirroring the script, plus: always
  use `just migrate "description"` (never raw `alembic revision`); the
  NOT NULL -> add nullable + `server_default` -> backfill -> tighten pattern
  (cite `197844c56085` as the canonical example); every migration needs a
  real docstring and meaningful slug; destructive changes are separate,
  deliberate contract migrations; migrations run on deploy so a failure =
  failed deploy.

### 3. Backfill the empty migration descriptions (zero-risk)

Seven files have blank docstrings / `_.py` slugs (created by running
`alembic revision` directly, bypassing `just migrate` which requires a
message): `f98e1c93dcd7`, `0d836462f7f7`, `4c072d8106a9`, `58e3011782fa`,
`65817fed5f7a`, `bdb2df886116`, `e51ecb1aaf56`. Add a one-line docstring to
each describing intent (read the `upgrade()` body). Renaming the file is
optional and cosmetic — the revision ID is what matters to the chain, so
editing just the docstring is zero-risk.

### 4. Wiring

Add a **local pre-commit hook** to `.pre-commit-config.yaml`
(`files: ^backend/alembic/versions/.*\.py$`, `pass_filenames: false`).
CI's `python_checks` (pre-commit) matrix task already runs
`pre-commit run --all-files`, so **no `ci.yml` change is needed**.

## Potential plans (optional — pick as desired)

- **Autogenerate-drift CI check** _(high value)_ — a CI step that runs
  `alembic revision --autogenerate` against a fresh migrated DB and fails if
  it produces any non-empty diff. Catches "model changed but migration
  forgotten" — a genuine class of bug the static checker cannot see. Needs a
  throwaway Postgres in CI (the E2E stack already has one).
- **Upgrade/downgrade round-trip test** — a test that runs
  `upgrade head` then `downgrade base` (or step-by-step) to prove every
  migration is actually reversible, not just syntactically present.
- **`compare_server_default` decision** — deliberately left **off** in
  `env.py` (recurring false-positive noise outweighs the benefit at this
  scale; DB defaults are few). Optional: add a one-line comment beside the
  `compare_type=True` lines recording this decision so it is not mistaken for
  an oversight.
- **Revision-ID naming consistency** — most migrations use autogenerated
  hashes, but several use custom short IDs (`msg001`, `org001`, `cbac001`,
  `sp001`, `pm001`, `teach001`). Harmless, but worth deciding on one
  convention going forward (recommend: let Alembic generate hashes; rely on
  the slug for readability).
- **Typing style consistency** — migration headers mix
  `Union[str, None]` and `str | None`. Cosmetic; Ruff/`UP` could normalise.
  Note: Black currently _excludes_ `alembic/versions`, so these files are not
  auto-formatted.
- **Date-prefixed filenames** — optionally uncomment `file_template` in
  `alembic.ini` so new migrations sort chronologically. Improves traceability;
  does not fix docstrings.
- **`post_write_hooks`** — optionally enable Ruff/Black on newly generated
  migrations via `alembic.ini` so new files are auto-formatted despite the
  pre-commit exclusion.
- **Set `lock_timeout` / `statement_timeout` on migrations** _(agreed — should
  do)_ — migrations currently set no timeouts, so a migration that cannot
  acquire its `ACCESS EXCLUSIVE` table lock quickly will **queue behind a
  long-running query and stall all traffic to that table** (the classic
  "tiny migration caused an outage" via lock-queue pile-up). Set e.g.
  `SET lock_timeout = '3s'; SET statement_timeout = '30s';` so a migration that
  can't get its lock **fails fast** instead of blocking the live app; thanks to
  transactional DDL it then rolls back cleanly and the old revision keeps
  serving. Apply centrally in `env.py` (execute the `SET`s at the start of
  `run_migrations_online`) so every migration inherits them, rather than
  per-file. Tune values for the environment.

## Concurrency and locking during migrations

How concurrent user / service writes interact with a running migration —
governed entirely by PostgreSQL locking, not by any app-level coordination
(there is no maintenance mode; nothing pauses the old app or the messaging
service).

- The **old** app keeps serving and writing to the same DB during the
  migration. The **new** app is not serving yet (still booting / not Ready),
  so it is not writing.
- **MVCC**: the migration's schema changes live in an uncommitted transaction,
  so they are invisible to everyone until commit. Mid-migration the old app
  still sees the old schema; at commit the new schema appears atomically.
- **Locks**: `ALTER TABLE` takes an `ACCESS EXCLUSIVE` lock on that table. For
  metadata-only changes (add column with a **constant** `server_default`, add
  table, add index normally, add FK on PG 11+) the lock is held for
  milliseconds — a concurrent write to that table queues briefly, then
  proceeds. Writes to other tables are unaffected. **No data is lost — conflicting
  writes are delayed, not dropped.**
- **Where it bites**: operations that hold the lock for a **full-table scan or
  rewrite** block writes to that table for the whole duration — adding a
  `NOT NULL` that must scan, changing a column type, or a non-concurrent
  `CREATE INDEX`. The current migrations avoid these (constant defaults, PG 11+
  fast defaults). The other hazard is the **lock queue**: one slow query already
  holding a lock makes the migration wait, and every new query then queues
  behind the migration's pending exclusive lock — a brief stall even for an
  instant migration. This is exactly what the `lock_timeout` item above guards
  against.

### Why the old app keeps working after the migration commits (expand-contract)

During a deploy the **old** and **new** app versions run **concurrently**
against **one** database: the old revision is still serving while the new one
boots. Expand-contract is what lets them safely share that single schema.

- **The rule**: only ever **add** things the old app can ignore — never
  **rename** or **drop** things it still relies on. New columns must be nullable
  or have a default, so the old app's existing `INSERT`s (which don't mention
  them) still satisfy the schema.
- **Why writes survive the commit**: the old app only breaks if something it
  _depends on_ changes. An additive change leaves every column/table its SQL
  references exactly where it was, so its queries still match the DB and its
  writes keep working. The new column is simply invisible to it.
- **What would break it** (and is therefore banned mid-deploy): `RENAME`,
  `DROP COLUMN` still in use, or `NOT NULL` **without** a default — each makes
  the old app's live SQL reference something that no longer exists or no longer
  fits, causing immediate errors against the mutated schema.
- **The contract half happens later**: the destructive cleanup (e.g. dropping
  the superseded column) ships in a **separate, subsequent migration**, once no
  running revision still uses the old shape.

This is why the "old revision keeps serving" safety net (see crash-loop
mitigation below) is only real if every migration is backward-compatible —
`check_migrations.py` + `backend.instructions.md` are what enforce that.

## Migration validation options (dry runs)

Three levels, cheapest to strongest — none wired up today except staging-first:

1. **Offline SQL preview** — `alembic upgrade head --sql` prints the SQL without
   executing it, for review. Cheap, but does not test against real data (won't
   catch a `NOT NULL` failing on existing NULLs).
2. **Run against a Cloud SQL clone** _(gold standard)_ — clone the prod instance
   (or restore from PITR/backup), run `upgrade head` against the clone, verify,
   then discard. Tests the migration against **real prod-shaped data**, so it
   _would_ catch the NULL-constraint trap.
3. **Staging-first — already in place.** Teaching is the de-facto staging gate:
   migrations run on teaching before production (production is a later,
   deliberate promotion of the same image), so a broken migration fails on
   teaching first. Only as representative as teaching's data.

Note on why we do **not** clone-migrate-swap the live DB as a routine strategy
(blue-green for databases): while the clone is migrated, new writes keep hitting
the original, so the clone goes stale and a swap would lose that data. Keeping
them in sync needs heavy machinery (logical replication / dual-writes / CDC).
The standard answer for the live DB is **expand-contract** (backward-compatible
changes so old and new code share one schema), with clone-and-test used only for
_validation_ (option 2), not for the rollout.

## Deploy-time crash-loop mitigation

Migrations run automatically from the serving container's entrypoint, so a
failed migration crash-loops the new revision. This section documents what
protects us today and the gaps.

### What protects us today (automatic, implicit)

- **Cloud Run revision model + health probes** (`infra/modules/cloud-run/main.tf`).
  A deploy (`gcloud run services update --image=…`) creates a **new revision**.
  Its `startup_probe` on `/api/health` (failure_threshold 6, ~70s) gates
  traffic, and `traffic { type = LATEST }` means "latest **ready** revision".
- On a failed migration the new container `exit 1`s, the revision **never
  becomes Ready**, so **traffic stays 100% on the previous healthy revision** —
  users are not taken down.
- `gcloud run services update` **waits for readiness and exits non-zero** when
  the revision fails, so the **deploy job fails** and the
  `notify-teaching-failure` Slack alert fires (`deploy.yml`).

Net: the crash-loop is caught at deploy time and the old revision keeps serving
automatically. There is **no explicit rollback/auto-revert** in the codebase —
and, for availability, none is needed because Cloud Run never cuts over. A
deliberate rollback is manual (`gcloud run services update-traffic
--to-revisions=<prev>=100` or redeploy the prior image).

### The subtle gap (largely closed by transactional DDL)

Important correction: on this setup a **partial** migration is prevented.
`env.py` wraps the whole run in a single `context.begin_transaction()` and does
**not** set `transaction_per_migration=True`, and PostgreSQL has **transactional
DDL**. So `alembic upgrade head` is **all-or-nothing**: if migration 5 of 7
fails, Postgres rolls back the entire batch (1–4 included) and the DB is left
**exactly at the pre-deploy revision**, untouched. The old revision then keeps
serving against the unchanged schema — there is nothing to downgrade.

Caveats where all-or-nothing breaks down (none present in current migrations):
**autocommit operations** that cannot run in a transaction (`CREATE INDEX
CONCURRENTLY`, `ALTER TYPE … ADD VALUE`, `VACUUM`) and **explicit commits inside
data migrations**. Those parts can commit independently and leave a partial
state; avoid them, or isolate them in their own migration.

The residual risk is therefore not "DB advances on failure" but
**non-backward-compatible changes that succeed** (e.g. `DROP COLUMN`, `RENAME`):
the migration commits, the new revision still fails to boot for some other
reason, and the old revision — still serving — now faces a schema it does not
understand. This is why **expand-contract discipline is the real mitigation, not
rollback**: as long as every migration is backward-compatible, the "old revision
keeps serving" safety net holds. The agreed `check_migrations.py` +
`backend.instructions.md` work is what makes this implicit rollback _safe_.

### Smoke-test caveat

`smoke-test.sh` polls the **public URL** `…/api/health`, which is served by the
**old (healthy) revision** if the new one failed — so it returns 200 and
**passes** regardless. The genuine gate is `gcloud` failing on non-readiness,
not the smoke test.

### Options (potential — pick as desired)

1. **Explicit rollback step** — an `on failure -> update-traffic to previous
revision` job. Largely redundant for availability (Cloud Run never cut over)
   but makes intent explicit and can be paired with a down-migration to cover
   the "DB moved ahead" case.
2. **Decouple migrations from the serving container** _(highest value)_ — run
   `alembic upgrade head` as a **separate pre-deploy Cloud Run Job** (the
   `admin` image target already exists), so schema changes are a deliberate,
   observable step that succeeds or blocks the deploy **before** a new app
   revision is created. Removes the "DB advances while old code serves" hazard
   entirely.
3. **Revision-specific smoke test** — hit the new revision's own URL (not the
   public one) so the smoke test actually verifies the _new_ revision rather
   than whatever is currently serving.

## Decisions needed

1. **Empty `downgrade()` for new migrations** — FAIL or WARN?
   _Recommendation: FAIL._
2. **check_migrations scope** — allow-list the existing 34 vs a `--changed`
   (git-diff) mode? _Recommendation: allow-list (deterministic in CI)._
3. **Docstring backfill** — do the 7 files now, or just allow-list them?
   _Recommendation: backfill (zero-risk, better traceability)._

## Related existing to-do items

Already tracked in `docs/docs/plans/todo.md`:

- Create `.github/instructions/backend.instructions.md` scoped to `backend/**`
  with Alembic expand-contract rules (Documentation section).
- Create `backend/scripts/check_migrations.py` — expand-contract migration
  lint rejecting destructive operations (Testing / CI section).

This document expands both into an actionable spec and adds the optional
hardening items above.
