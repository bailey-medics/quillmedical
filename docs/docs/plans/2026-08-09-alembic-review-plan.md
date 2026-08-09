# Alembic review and migration safety plan

**Date:** 2026-08-09
**Status:** Review complete; decisions made; awaiting implementation
**Scope:** `backend/alembic/` — reviewed during the backend human code review

This document is organised in four parts:

- **Part 1 — What we reviewed and why**: the scope, the findings, and the
  reasoning behind every decision (how migrations run, locking, expand-contract,
  crash-loop containment, and validation approaches).
- **Part 2 — What we planned to do**: each item a tickbox, with its decision
  recorded inline.
- **Part 3 — What we decided not to do**: options deliberately rejected, and why.
- **Part 4 — Tests**: what proves the changes work and break nothing.

## Part 1 — What we reviewed and why

### Scope and how migrations run

- Migrations run **automatically on every deploy** via
  `backend/docker/entrypoint.sh` (`alembic upgrade head`, 5 retries, then
  `exit 1`). A failed migration therefore **crash-loops the container** —
  migration safety is a deploy-availability concern, not just tidiness.
- `env.py` migrates the **core DB only** (`Base.metadata` + an explicit
  import of teaching models). HAPI FHIR and EHRbase manage their own
  schemas and are deliberately out of scope.
- 34 migrations, one unbroken linear chain from base `49c5bacfa481`
  (init_auth_tables) to head `org002`.

### Already fixed during the review

- **Removed orphan entrypoint** — deleted
  `backend/alembic/docker/entrypoint.sh` (and its now-empty folder). It was
  referenced by nothing; the live entrypoint is `backend/docker/entrypoint.sh`.
  The orphan was also the inferior version (swallowed migration failures with
  a warning and served anyway, vs the live one which retries then exits).

### What we found (no action required)

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

### Concurrency and locking during a migration

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
  instant migration. This is exactly what the `lock_timeout` plan (Part 2)
  guards against.

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

#### Renames need backfill + dual-write

A "rename" (`body` → `content`) is really a **copy-and-retire** spread across
several deploys — you cannot just rename the column, because that instantly
breaks the still-serving old app. You need **both** a backfill (for existing
rows) **and** dual-writes (for rows that change while you migrate), because the
old and new versions run concurrently and the table is a moving target:

1. **Expand** — add nullable `content`; deploy an app that **writes both**
   `body` and `content` but still **reads `body`**. From here every new/updated
   row keeps the two in sync.
2. **Backfill** — copy the historical rows the dual-write hasn't touched:
   `UPDATE … SET content = body WHERE content IS NULL`, **batched** for large
   tables (e.g. `… LIMIT 10000` in a loop) to avoid a full-table lock or one
   giant transaction.
3. **Switch reads** — deploy an app that **reads `content`** (still writing
   both, for safety).
4. **Contract** — deploy an app that **stops writing `body`**, then a final
   migration `DROP COLUMN body`.

The one-off `UPDATE` handles rows that **already exist**; the app-side
dual-write handles rows that **change during** the migration — you need both.

Simpler cases skip all of this: a brand-new column with no historical meaning
(default NULL) needs no copy, and a column with a **constant** `server_default`
is filled for existing rows automatically at migration time. A copy is only
needed when the new column must **inherit meaning** from an old one.

This is why the "old revision keeps serving" safety net (see crash-loop
mitigation below) is only real if every migration is backward-compatible —
`check_migrations.py` + `backend.instructions.md` are what enforce that.

### Migration validation approaches (dry runs)

Three levels, cheapest to strongest:

1. **Offline SQL preview** — `alembic upgrade head --sql` prints the SQL without
   executing it, for review. Cheap, but does not test against real data (won't
   catch a `NOT NULL` failing on existing NULLs). Not pursued — the static
   `check_migrations.py` already catches the one trap it might reveal.
2. **Run against a Cloud SQL clone** _(gold standard)_ — a desired plan (Part 2),
   tagged to adopt **before real production / patient load**. Clone the prod
   instance, run `upgrade head` against the clone, verify, then discard — tests
   against **real prod-shaped data**.
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

### How a failed migration is contained today (crash-loop mitigation)

Migrations run automatically from the serving container's entrypoint, so a
failed migration crash-loops the new revision. This documents what protects us
today and the gaps.

#### What protects us today (automatic, implicit)

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

#### The subtle gap (largely closed by transactional DDL)

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

#### Smoke-test caveat

`smoke-test.sh` polls the **public URL** `…/api/health`, which is served by the
**old (healthy) revision** if the new one failed — so it returns 200 and
**passes** regardless. The genuine gate is `gcloud` failing on non-readiness,
not the smoke test.

#### Where the mitigation options landed

The three mitigation options are resolved: **decouple migrations into a
pre-deploy Cloud Run Job** and a **revision-specific smoke test** are in Part 2
(planned); the **explicit rollback step** is in Part 3 (deliberately not done —
redundant given Cloud Run's automatic old-revision fallback and our
roll-forward posture).

## Part 2 — What we planned to do

Every item is agreed and desired; each carries its decision inline. They are
ordered as an implementation sequence: build the guardrails first (1–5), then
clean up the existing history (6–10), then runtime safety (11), then the
scale-gated items to adopt **before real production / patient load** (12–14).

### 1. `backend/scripts/check_migrations.py` — automated enforcement

- [ ] Create `backend/scripts/check_migrations.py` with the five checks below.

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

### 2. Fail (not warn) on an empty `downgrade()`

- [ ] Make `check_migrations.py` check #3 a hard **FAIL** on new migrations.

`check_migrations.py` check #3 treats a missing / empty / `pass`-only
`downgrade()` on a **new** migration as a hard **FAIL**, not a warning. Keeps
the reversibility gate enforceable: every new migration must ship a real
downgrade body.

### 3. `.github/instructions/backend.instructions.md` — documented rules

- [ ] Create `.github/instructions/backend.instructions.md` scoped to `backend/**`.

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

### 4. Autogenerate-drift CI check

- [ ] Add a CI step that runs `alembic revision --autogenerate` against a fresh
      migrated DB and fails on any non-empty diff.

_(high value)_ — a CI step that runs `alembic revision --autogenerate` against a
fresh migrated DB and fails if it produces any non-empty diff. Catches "model
changed but migration forgotten" — a genuine class of bug the static checker
cannot see. Needs a throwaway Postgres in CI (the E2E stack already has one).
**Always run it — never gate it on migration files changing.** The bug it
catches is precisely a PR that edits a model but adds **no** migration, so a
"migrations changed" filter would skip the one case that matters. **Decided: run
on every backend CI run** (not gated on model or migration changes) — the run is
cheap and determinism beats the saved seconds.

### 5. Wiring — pre-commit hook

- [ ] Add the local pre-commit hook for `check_migrations.py` to `.pre-commit-config.yaml`.

Add a **local pre-commit hook** to `.pre-commit-config.yaml`
(`files: ^backend/alembic/versions/.*\.py$`, `pass_filenames: false`).
CI's `python_checks` (pre-commit) matrix task already runs
`pre-commit run --all-files`, so **no `ci.yml` change is needed** — the check
runs in CI for free via that step.

Two subtleties worth recording:

- **`pass_filenames: false`** means the script never receives the staged
  filenames; it scans the whole `versions/` directory itself. So chain-integrity
  checks (one base, one head) always see **all** migrations, even when only one
  file changed. The `files:` pattern only decides **whether** the hook runs, not
  **what** it inspects.
- On `pre-commit run --all-files` the `files:` filter matches every migration,
  so CI runs the same full-directory scan regardless of what changed in the PR.

### 6. Backfill the empty migration descriptions (zero-risk)

- [ ] Add a one-line docstring to each of the seven empty-description migrations.

Seven files have blank docstrings / `_.py` slugs (created by running
`alembic revision` directly, bypassing `just migrate` which requires a
message): `f98e1c93dcd7`, `0d836462f7f7`, `4c072d8106a9`, `58e3011782fa`,
`65817fed5f7a`, `bdb2df886116`, `e51ecb1aaf56`. Add a one-line docstring to
each describing intent (read the `upgrade()` body). Renaming the file is
optional and cosmetic — the revision ID is what matters to the chain, so
editing just the docstring is zero-risk.

### 7. Typing style consistency — remove both excludes now

- [ ] Delete the Ruff and Black `alembic/versions` excludes and reformat the lot
      in one pass.

_(recommended while there is no live data)_ — migration headers mix
`Union[str, None]` and `str | None`. The fix is Ruff's `UP` group (pyupgrade),
**not** Black: `UP` rewrites `Union[str, None]` → `str | None`; Black only
handles whitespace/quotes/line-length. Both tools currently exclude the folder:
Ruff `exclude = ["alembic/versions"]` and Black
`exclude = "(^|/)backend/alembic/versions(/|$)"` in `backend/pyproject.toml`.
A `UP`/Black pass is **purely cosmetic**: it never touches revision IDs,
`down_revision` links, or the `upgrade()`/`downgrade()` SQL — only the
decorative header type hints Alembic never reads at runtime. And Alembic
**never re-runs an already-applied migration** (it checks `alembic_version`
and skips), so reformatting a shipped file is invisible even on a populated
DB — the "immutable history" rule is about not changing what a migration
_does_, not its formatting. The only cost is a one-off 34-file churn commit
and a `git blame` redirect. **Recommendation:** delete both `exclude` lines
and let `pre-commit run --all-files` reformat the lot in one commit — this
fixes the existing files _and_ auto-formats all future migrations via the
normal pre-commit pass.

### 8. Date-prefixed filenames

- [ ] Uncomment `file_template` in `alembic.ini` and retroactively rename all 34
      existing files with date prefixes.

_(recommended)_ — uncomment `file_template` in `alembic.ini`
(`%%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s`)
so new migrations become `2026_08_09_1430-<rev>_<slug>.py` and sort
chronologically in the file explorer. **Prefer date over an incremental
number:** Alembic has no native monotonic counter, so `0001_`, `0002_` would
be hand-maintained bookkeeping that collides the moment two branches are in
flight; the date template is built-in, zero-maintenance, and conveys the same
ordering. The prefix is **purely a human-sorting affordance** — true ordering
is always the `down_revision` chain, never the filename.
**Decided: retroactively rename all 34 existing files with date prefixes**
(cheap now, no live data): the revision ID lives _inside_ each module
(`revision = "…"`), and Alembic scans the directory reading each module's
`revision`/`down_revision`, so the filename is never the source of truth —
renaming cannot break the chain. Backfill accurate prefixes from each file's
existing `Create Date:` header. Caveat: the date reflects _creation_ time,
which equals _chain_ order only because this repo keeps a strictly linear
single-head history (it does). Improves traceability; does not fix docstrings.

### 9. `compare_server_default` — record the decision

- [ ] Add a one-line comment beside the `compare_type=True` lines in `env.py`.

Deliberately left **off** in `env.py` (recurring false-positive noise outweighs
the benefit at this scale; DB defaults are few). Add a one-line comment beside
the `compare_type=True` lines recording this decision so it is not mistaken for
an oversight.

### 10. Revision-ID naming consistency

- [ ] Adopt Alembic-generated hashes for new migrations; leave existing IDs as-is.

Most migrations use autogenerated hashes, but several use custom short IDs
(`msg001`, `org001`, `cbac001`, `sp001`, `pm001`, `teach001`). Harmless.
**Decided: let Alembic generate hashes going forward and rely on the slug for
readability** — do not hand-author custom short IDs. Existing custom IDs stay
as-is (renaming a revision ID would break the chain); the convention applies to
new migrations only.

### 11. Set `lock_timeout` / `statement_timeout` on migrations

- [ ] Execute the `SET`s at the start of `run_migrations_online` in `env.py`.

_(agreed — should do)_ — migrations currently set no timeouts, so a migration
that cannot acquire its `ACCESS EXCLUSIVE` table lock quickly will **queue
behind a long-running query and stall all traffic to that table** (the classic
"tiny migration caused an outage" via lock-queue pile-up). Set e.g.
`SET lock_timeout = '3s'; SET statement_timeout = '30s';` so a migration that
can't get its lock **fails fast** instead of blocking the live app; thanks to
transactional DDL it then rolls back cleanly and the old revision keeps
serving. Apply centrally in `env.py` (execute the `SET`s at the start of
`run_migrations_online`) so every migration inherits them, rather than
per-file. **Decided: `lock_timeout = 3s`, `statement_timeout = 30s`.**

### 12. Decouple migrations from the serving container

- [ ] Run `alembic upgrade head` as a separate pre-deploy Cloud Run Job.
      _(adopt before real production / patient load)_

_(highest value at scale)_ — run `alembic upgrade head` as a **separate
pre-deploy step** (a Cloud Run **Job** — the `admin` image target already
exists) against the **same** core DB, **before** the new app revision is
created. Same database and same migrations; only the runner and timing change
(no new DB). Benefits: the migration runs **exactly once** (removing the
multi-instance race where several new-revision instances each run the migration
on startup), gives a clean pass/fail signal separate from app boot, and lets the
app service account drop DDL privileges (least privilege). Priority: adopt
**before real production / patient load** and before scaling instances up — the
risks it removes only bite with multiple instances against real data, which we
don't have yet.

### 13. Revision-specific smoke test

- [ ] Point the deploy smoke test at the new revision's tagged, `--no-traffic` URL.
      _(adopt before real production / patient load)_

Point the deploy smoke test at the **new revision's own tagged URL** (a Cloud
Run traffic **tag** deployed `--no-traffic`), not the public URL, so it verifies
the revision just shipped rather than whatever is currently serving. No
load-balancer / Caddy change is needed while `ingress = ALL`; it requires
switching the deploy to tag + no-traffic, then a promote step. **Complements**
(does not replace) the decoupled migration job and the public-edge smoke test —
the three cover different failure domains (DB change, new-revision health, public
edge).

### 14. Validate migrations against a Cloud SQL clone

- [ ] Clone prod, run `alembic upgrade head`, verify, then discard.
      _(adopt before real production / patient load)_

_(gold standard; adopt before real production / patient load)_ — before applying
a migration to production, clone the prod instance (or restore from
PITR/backup), run `alembic upgrade head` against the clone, verify, then
discard. Tests the migration against **real prod-shaped data**, so it catches
failures that only surface against live rows — the classic being a `NOT NULL`
that fails on existing un-backfilled NULLs. Only worth its setup cost
(clone/restore automation, a deploy/CI step, teardown) once production holds data
that teaching's staging gate no longer represents — so adopt it **before real
production / patient load**, alongside the decoupled migration job. Until then,
staging-first (Part 1) plus `check_migrations.py` cover the realistic cases.
Note: this is clone-and-**test** only, not clone-migrate-**swap** — the clone is
discarded, never promoted (see the blue-green caveat in Part 1).

### Open decision

- **`check_migrations` scope** — allow-list the existing 34 revisions vs a
  `--changed` (git-diff) mode? Recommendation: **allow-list** (deterministic in
  CI; matches plan 1). Left open for final confirmation.

## Part 3 — What we decided not to do

- **Explicit rollback step (deploy)** — an "on failure → update-traffic to the
  previous revision" job. **Not needed** — Cloud Run already keeps 100% of
  traffic on the previous healthy revision when a new one fails to become Ready,
  and we've chosen a **roll-forward** posture (no production downgrades). Its
  only extra value would be triggering an automatic DB _downgrade_, which we've
  explicitly decided against.
- **`post_write_hooks`** — enabling Ruff/Black on newly generated migrations at
  `just migrate` time via `alembic.ini`. **Not needed** — the "Typing style"
  plan removes both the Ruff and Black `exclude` lines for `alembic/versions`,
  so the ordinary `pre-commit` pass now formats every migration (existing and
  new) on commit. A post-write hook would only format marginally earlier (at
  generation rather than commit time), duplicating what pre-commit already does.
- **Upgrade/downgrade round-trip test** — a test that runs `upgrade head` then
  `downgrade base` (or step-by-step) to prove every migration is reversible, not
  just syntactically present. **Decided against — roll-forward posture.** This
  plan already concludes that expand-contract + roll-forward is the real
  mitigation and that we never `downgrade` production (Cloud Run never cuts
  over). Testing downgrade reversibility validates a path we won't use, and a
  downgrade that drops a column is _structurally_ reversible yet still destroys
  data — so the test proves little of value at real ongoing cost (throwaway
  Postgres, CI wiring, schema-reset fixtures, isolation flakiness). The cheap
  80% is already covered: `check_migrations.py` statically asserts `downgrade()`
  isn't empty, and `upgrade head` on a fresh DB is exercised for free whenever
  CI/tests spin up the stack — which is the direction that actually runs on
  deploy.

## Part 4 — Tests: proving it works and nothing broke

Each change ships with tests. **Group A** proves the new tooling works;
**Group B** proves the existing migration history and the deploy path are
unbroken; **Group C** covers the scaled-infrastructure items, exercised only
when those land. Backend tests run in Docker (`just ub`).

### A. New tooling behaves correctly

- [ ] **`check_migrations.py` unit tests** — one passing and one failing fixture
      per check (chain integrity, non-empty description, reversibility, NOT NULL
      trap, destructive-op marker); assert exit code and message for each.
- [ ] **Allow-list honoured** — running the script against the current 34
      revisions exits 0 (grandfathered); a synthetic new migration violating each
      rule exits non-zero.
- [ ] **Empty-downgrade is a hard FAIL** — a new migration with an empty /
      `pass`-only `downgrade()` fails (not a warning).
- [ ] **Pre-commit hook fires** — `pre-commit run --all-files` runs the hook and
      passes on clean history; the `files:` pattern triggers it on a versions
      file edit.
- [ ] **Autogenerate-drift check** — against a fresh migrated DB the autogenerate
      diff is empty (green); a deliberately-added model column with no migration
      produces a non-empty diff (red), proving the check catches drift.
- [ ] **Lock / statement timeouts applied** — assert `env.py` issues
      `SET lock_timeout = '3s'` and `SET statement_timeout = '30s'` at the start
      of `run_migrations_online` (capture via a spy engine or an integration run).

### B. Nothing broke (regression / safety)

- [ ] **Fresh upgrade succeeds** — `alembic upgrade head` on an empty DB
      completes with no error (the exact path that runs on deploy).
- [ ] **Chain unchanged after renames + docstrings** — `alembic history` and
      `alembic heads` are identical before and after the date-prefix rename and
      the docstring backfill (single base, single head `org002`, same order).
- [ ] **Reformat is behaviour-preserving** — after removing the Ruff/Black
      excludes and reformatting, `alembic history` is unchanged and
      `alembic upgrade head` still succeeds (only header type hints changed; no
      `revision` / `down_revision` / SQL edits).
- [ ] **Schema parity** — the schema produced by `upgrade head` after the changes
      matches the pre-change schema (compare `pg_dump --schema-only`), proving the
      docstring / rename / format work changed nothing structural.
- [ ] **Full backend suite** — `just ub` passes (models and migrations still
      consistent with the app).

### C. Deferred (verify only when the scaled items land)

- [ ] **Decoupled migration Job** — the Cloud Run Job runs `upgrade head` exactly
      once, exits 0, and the app revision boots against the migrated DB.
- [ ] **Revision-specific smoke test** — the tagged, `--no-traffic` revision
      returns 200 on `/api/health` before promotion.
- [ ] **Cloud SQL clone validation** — `upgrade head` against a prod clone passes,
      then the clone is discarded.

## Related existing to-do items

Already tracked in `docs/docs/plans/todo.md`:

- Create `.github/instructions/backend.instructions.md` scoped to `backend/**`
  with Alembic expand-contract rules (Documentation section).
- Create `backend/scripts/check_migrations.py` — expand-contract migration
  lint rejecting destructive operations (Testing / CI section).

This document expands both into an actionable spec and adds the optional
hardening items above.
