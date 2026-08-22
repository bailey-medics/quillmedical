# Alembic review and migration safety plan

**Date:** 2026-08-09
**Status:** Review complete; decisions made; awaiting implementation
**Scope:** `backend/alembic/` — to be reviewed during the backend human code review

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
- `env.py` migrates the **core database (DB) only** (`Base.metadata` + an explicit
  import of teaching models). HAPI FHIR and EHRbase manage their own
  schemas and are deliberately out of scope.
- 35 migrations, one unbroken linear chain from base `49c5bacfa481`
  (init_auth_tables) to head `teach001` (chain tail `50cac628e9c6` →
  `org002` → `teach001`). Note: `teach001` uses **untyped** module-level
  assignments (`revision = "…"`, no `: str`), unlike every other revision —
  so any tooling that parses these files must read both annotated and plain
  assignments.

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
- **Heads check: PASS.** Single base, single head (`teach001`), no branches,
  no multiple heads, no cycles — `alembic upgrade head` is unambiguous.
  **Currently unenforced**, though: there is no continuous-integration (CI) job
  or pre-commit hook that checks for multiple heads today — only human review
  stands between a bad
  merge and two heads reaching `main`. Items 1 and 5 close this gap (the
  chain-integrity check runs in pre-commit and, via the existing
  `python_checks` matrix, in CI).
- **Risk-signal scan: all clear.** Every `nullable=False` on an _existing_
  table is paired with a `server_default` (e.g. `197844c56085` even backfills
  existing rows to `true`). Every destructive `drop_*` is confined to a
  `downgrade()`. Data migrations (`50cac628e9c6`, `org002`) are safe with
  documented lossy downgrades where relevant. Foreign-key (FK) `CASCADE`->`RESTRICT`
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
- **MVCC (Multi-Version Concurrency Control)**: the migration's schema changes
  live in an uncommitted transaction,
  so they are invisible to everyone until commit. Mid-migration the old app
  still sees the old schema; at commit the new schema appears atomically.
- **Locks**: `ALTER TABLE` takes an `ACCESS EXCLUSIVE` lock on that table. For
  metadata-only changes (add column with a **constant** `server_default`, add
  table, add index normally, add FK on PostgreSQL (PG) 11+) the lock is held for
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
mitigation below) is only real if every migration is backward-compatible (only
the **currently-serving** migration and the **newly-deploying** one need to be
compatible with each other) — `check_migrations.py` +
`backend.instructions.md` are what enforce that.

### The same rule on the client — stale browsers and API compatibility

The "old and new coexist" law is not confined to the server. A user's browser
runs whatever JavaScript bundle it downloaded when the page loaded, and **keeps
running it until the tab is reloaded** — which can be days. So after a deploy a
clinician may be running last week's frontend against today's backend, a
**stronger** version of the rolling-deploy problem (a Cloud Run revision rolls
over in minutes; a browser tab does not).

Two consequences for an enterprise, healthcare-ready product:

- **The API (application programming interface) is a contract old clients still
  depend on.** Every response shape and required request field must stay
  backward-compatible across the window in
  which stale clients exist. Additive response changes are safe (old client
  ignores them); renaming/removing/retyping a field, or adding a required
  request field, breaks stale clients instantly — the exact client-side mirror
  of the DB expand-contract rule.
- **Staleness must be bounded.** A client that can run indefinitely against a
  moving API is a latent safety hazard; the app needs a way to detect a new
  build and reload safely.

These are addressed by two new Part 2 items — **client version detection /
silent reload** (item 14) and **backwards-compatible API windows** (item 15) —
the client / API-contract counterpart to the database migration safety above.

### How many versions actually coexist — the one-old-one-new invariant

The expand-contract reasoning above talks about "the old app and the new app"
as if there are always exactly two. In our setup that is the routine case, but
it is a **consequence of two specific design choices**, not a law — and it pays
to know why, because the real safety rule is subtler than "only two".

- **Cloud Run serves only the latest _ready_ revision** (`traffic { type =
LATEST }`, no traffic splitting). During a rollover the old revision keeps
  serving while the new one boots; the instant the new one is ready, traffic
  flips 100% and the old one stops receiving requests (it lingers a few seconds
  draining in-flight requests, then scales to zero). One deploy = exactly two
  code versions coexisting, transiently.
- **Deploys to `main` are serialised.** In `.github/workflows/deploy.yml` the
  `concurrency` block keys on `github.ref` with `cancel-in-progress: false`, so
  two quick merges to `main` share one group and the second run **queues behind**
  the first rather than running alongside it. Deploy B does not start until
  deploy A has fully finished, so two fresh rollouts never overlap and the two
  deploys' migrations apply strictly in order.

Together these give the one-old-one-new invariant in practice: no traffic
splitting + serialised deploys.

**The rule that actually matters does not depend on "only two".** Expand-contract
safety is not "compatible with _the_ previous version" — it is "**compatible
with the _oldest still-running_ version**". Because deploys are serialised and
Cloud Run only serves latest-ready, the oldest still-running version is always
just the immediate predecessor, so **pairwise** backward-compatibility is
sufficient _given this architecture_. "Only two" is what lets us reason so
simply; it is not guaranteed by anything fundamental. If we later adopt
canary / gradual rollouts, the rule automatically generalises to "compatible
with every revision still receiving traffic".

**Edge cases where more than two can coexist:**

- ~~**`workflow_dispatch` from a different ref.**~~ **Fixed.** The concurrency
  group was keyed on `github.ref`, so a push to `main` (`deploy-refs/heads/main`)
  and a manually dispatched deploy from a tag or hotfix branch used
  **different** groups and were not serialised against each other. `deploy.yml`
  now uses a fixed group (`group: deploy`), so every run of the workflow —
  push-triggered or dispatched, from any ref — queues in the same group.
- **Traffic pinning / manual rollback.** If an operator pins traffic to an older
  revision and then a deploy lands, pinned-old + new serve simultaneously — a
  deliberate, operator-created situation. Not something to prevent (it is the
  manual emergency-rollback tool), but its safety boundary is narrower than it
  looks: expand-contract only guarantees compatibility between **immediately
  adjacent** revisions, not across a gap. Pinning back to the **immediately
  preceding** revision is always safe. Pinning back **further** is only safe if
  no destructive/contract migration (a completed rename's `DROP COLUMN`, etc.)
  has shipped since that older revision — otherwise the pinned code may
  reference a column or table that no longer exists. Recorded as an
  operational rule in `backend.instructions.md`.
- **Multiple _instances_ of the same new revision** (not a different version).
  One revision can scale to N instances, and migrations currently run from the
  container entrypoint, so several instances of the **same** new version may each
  race to run `alembic upgrade head` on startup. That is not "three versions" —
  it is the **multi-instance migration race** that item 12 (decouple migrations
  into a run-once pre-deploy Job) removes.

### Migration validation approaches (dry runs)

Three levels, cheapest to strongest:

1. **Offline SQL preview** — `alembic upgrade head --sql` prints the SQL without
   executing it, for review. Cheap, but does not test against real data (won't
   catch a `NOT NULL` failing on existing NULLs). Not pursued — the static
   `check_migrations.py` already catches the one trap it might reveal.
2. **Run against a Cloud SQL clone** _(gold standard)_ — tracked in `todo.md` as
   a pre-clinical item, to adopt **before real production / patient load**. Clone
   the prod instance, run `upgrade head` against the clone, verify, then discard
   — tests against **real prod-shaped data**.
3. **Staging-first — already in place.** Teaching is the de-facto staging gate:
   migrations run on teaching before production (production is a later,
   deliberate promotion of the same image), so a broken migration fails on
   teaching first. Only as representative as teaching's data.

Note on why we do **not** clone-migrate-swap the live DB as a routine strategy
(blue-green for databases): while the clone is migrated, new writes keep hitting
the original, so the clone goes stale and a swap would lose that data. Keeping
them in sync needs heavy machinery (logical replication / dual-writes / change
data capture (CDC)).
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
DDL** (data definition language). So `alembic upgrade head` is **all-or-nothing**: if migration 5 of 7
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
deploy-infrastructure items (12–13), then the client / API-contract safeguards
(14–15) that keep stale browsers safe against a moving backend. Documentation
(16) is **not** a final batch: every item updates both `backend.instructions.md`
(the enforceable rule) and the docs page (both the rule and the reasoning,
duplication accepted) as it lands, then hands off for human review — so both
are complete by the time the last item ships.

### 1. `backend/scripts/check_migrations.py` — automated enforcement

- [x] Create `backend/scripts/check_migrations.py` with the five checks below.

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

Originally allow-listed the existing 35 revisions so current history passed
while holding new migrations to the full standard. **Superseded by item 17**:
the history was squashed to a single baseline (`878bc9300d4f`), so
`ALLOWLISTED_REVISIONS` is now empty and every migration — the baseline
included — is held to the full standard. The parser originally read both
annotated (`revision: str = "…"`) and plain (`revision = "…"`) assignments
to accommodate `teach001`'s untyped style; since the squash retired
`teach001` and the baseline uses the standard annotated form, the
plain-assignment fallback has been removed — the parser now only reads
annotated assignments. Runnable as
`python backend/scripts/check_migrations.py --all`.

### 2. Fail (not warn) on an empty `downgrade()`

- [x] Make `check_migrations.py` check #3 a hard **FAIL** on new migrations.

`check_migrations.py` check #3 treats a missing / empty / `pass`-only
`downgrade()` on a **new** migration as a hard **FAIL**, not a warning. Keeps
the reversibility gate enforceable: every new migration must ship a real
downgrade body.

### 3. `.github/instructions/backend.instructions.md` — documented rules

- [x] Create `.github/instructions/backend.instructions.md` scoped to `backend/**`.

- **Location: repo-root `.github/instructions/`** (NOT nested under
  `backend/` — VS Code only auto-discovers root). Scope via frontmatter
  `applyTo: "backend/**"`, matching `just.instructions.md`.
- Content: Alembic expand-contract rules mirroring the script, plus: always
  use `just migrate "description"` (never raw `alembic revision`); the
  NOT NULL -> add nullable + `server_default` -> backfill -> tighten pattern
  (originally cited `197844c56085` as the canonical example; that revision
  no longer exists standalone after the item 17 squash, so the citation was
  repointed per that plan's step 5); every migration needs a real docstring
  and meaningful slug; destructive changes are separate, deliberate contract
  migrations; migrations run on deploy so a failure = failed deploy.
- Also record the **`compare_server_default` off** decision (item 9) here, so
  the rationale lives alongside the other Alembic conventions, not only as an
  inline `env.py` comment.

### 4. Autogenerate-drift CI check

- [x] Add a CI step that runs `alembic revision --autogenerate` against a fresh
      migrated DB and fails on any non-empty diff.

_Implemented via Alembic's built-in `alembic check` command_ (equivalent
autogenerate comparison, no throwaway revision file to generate/clean up)
rather than a hand-rolled `alembic revision --autogenerate` + diff script.
Landed as its own small fast-tier job — `alembic_drift_check` in
`.github/workflows/ci.yml` — with a Postgres service container (the
`unit` job's DB-less pytest run was left untouched). Regression-tested in
`backend/tests/test_alembic_check.py` (green + red paths). Required as a
branch-protection status check in `infra/github/branch_rules.tf`
(`"Alembic autogenerate drift check"` — not yet applied via `terraform
apply`). Documented in `backend.instructions.md` and the new
[Alembic migration safety](../backend/alembic-migration-safety.md) docs
page (also backfills items 1-3's reasoning, per item 16).

_(high value)_ — a CI step that runs `alembic revision --autogenerate` against a
fresh migrated DB and fails if it produces any non-empty diff. Catches "model
changed but migration forgotten" — a genuine class of bug the static checker
cannot see. Needs a throwaway Postgres in CI (the end-to-end (E2E) stack already has one).
**Always run it — never gate it on migration files changing.** The bug it
catches is precisely a PR that edits a model but adds **no** migration, so a
"migrations changed" filter would skip the one case that matters. **Decided: run
on every backend CI run** (not gated on model or migration changes) — the run is
cheap and determinism beats the saved seconds.

**Tier placement — fast (light) tier, but DB-backed.** `ci.yml` is explicitly
two-tier: a **fast tier** on every push (`python_checks` with its `pre-commit`
and `unit` matrix tasks, `typescript_checks`, `shell_checks`,
`version_consistency`) and a **heavy tier** on non-draft PRs to `main` only
(`heavy_storybook_tests`, `heavy_semgrep`, E2E). This check belongs in the
**fast tier**, alongside `python_checks: unit` — the bug it catches is per-change
and must gate every backend push, not surface only on a heavy PR run or at
deploy time. It does **not** belong in the heavy tier despite needing a database:
a Postgres **service container** in Actions is lightweight (seconds to boot),
nowhere near the minutes that define the heavy tier. The one caveat: the current
fast-tier `unit` job runs `pytest -m "not integration and not e2e"` and has **no
Postgres service**, so this item introduces the first DB service to the fast
tier — either add a `services: postgres:` block to the `unit` job, or give this
check its own small fast-tier job. It stays fast tier either way. (Contrast item
1 / item 5: `check_migrations.py` is pure static with no DB, so it rides the
`python_checks: pre-commit` task for free — the one truly _light_ check.)

### 5. Wiring — pre-commit hook

- [x] Add the local pre-commit hook for `check_migrations.py` to `.pre-commit-config.yaml`.

Added as the `check-migrations` local hook in `.pre-commit-config.yaml`
(`entry: python3 backend/scripts/check_migrations.py --all`, `language:
system` since the script is pure-stdlib with no dependencies to install).
Verified both paths: `pre-commit run check-migrations --all-files` passes
against the current (compliant) history, and a deliberately bad migration
(empty `downgrade()`) correctly fails the hook. Documented in
[Alembic migration safety](../backend/alembic-migration-safety.md) (layer 1
section updated to reflect the hook is now live).

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

- [x] ~~Add a one-line docstring to each of the seven empty-description
      migrations.~~ **Moot — superseded by item 17.** The seven files
      (`f98e1c93dcd7`, `0d836462f7f7`, `4c072d8106a9`, `58e3011782fa`,
      `65817fed5f7a`, `bdb2df886116`, `e51ecb1aaf56`) no longer exist: the
      squash collapsed the entire history into the single baseline
      `878bc9300d4f`, which carries its own real docstring.

Originally: seven files had blank docstrings / `_.py` slugs (created by
running `alembic revision` directly, bypassing `just migrate` which requires
a message). Nothing to do here now — see item 17 for the squash that
retired them.

### 7. Typing style consistency — remove both excludes now

- [x] Delete the Ruff and Black `alembic/versions` excludes in
      `backend/pyproject.toml`.
- [x] Reformat the baseline `878bc9300d4f_initial_baseline_schema.py` to the
      modern `str | None` style.
- [x] Update `backend/alembic/script.py.mako` to the modern `str | None` style
      so every future migration is born correctly formatted.

Deleted both excludes: Ruff's `exclude = ["alembic/versions"]` and Black's
`exclude = "(^|/)backend/alembic/versions(/|$)"` in `backend/pyproject.toml`,
plus the mirrored `exclude:` on the Black hook in `.pre-commit-config.yaml`
(pre-commit's own per-hook `exclude` filters which files reach the tool at
all, so it had to go too or the pyproject.toml change would have been a
no-op under `pre-commit run --all-files`). Updated `script.py.mako` to
`from collections.abc import Sequence`, `str | None`,
`str | Sequence[str] | None` so every future migration is born in the
modern style. Ran `pre-commit run ruff` then `black` against the baseline
file to let `UP` (pyupgrade) and Black reformat it — a 668-line diff, but
confirmed purely cosmetic (headers, quote style, one-arg-per-line column
wrapping, import order) by re-running `alembic downgrade base && alembic
upgrade head && alembic check` against a live Postgres (clean, no drift),
the full `check_migrations.py` static checker (still passes), the full
backend unit suite via `just ub` (all green), and `mypy --strict` on
`backend/app` plus the reformatted file (clean). `pre-commit run
--all-files` is clean across the whole repo.

_(recommended while there is no live data)_ — migration headers mix
`Union[str, None]` and `str | None`. **Partially moot after the plan item 17
squash**: the 35-file churn this item originally described no longer
applies — only the single baseline `878bc9300d4f` remains, and it still uses
the old `Union[str, None]` style, so there is exactly one file to reformat,
not 35. The underlying recommendation stands unchanged, just cheaper: the fix
is Ruff's `UP` group (pyupgrade),
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
_does_, not its formatting.

**Fix the root cause, not just the symptom:** `backend/alembic/script.py.mako`
— the Mako template `alembic revision` / `just migrate` uses to scaffold
every new migration — still hardcodes the old style
(`from typing import Sequence, Union`, `Union[str, None]`,
`Union[str, Sequence[str], None]`). Deleting the excludes alone only fixes
files retroactively; every new migration would still be born in the old
style and get silently reformatted at the next `pre-commit` run. Update the
template itself alongside the exclude removal so new migrations are correct
on creation and never touch the `UP`/Black rule again. **Recommendation:**
delete both `exclude` lines, update `script.py.mako` to
`str | None` / `str | Sequence[str] | None`, and let
`pre-commit run --all-files` reformat the one existing baseline file.

### 8. Date-prefixed filenames

- [x] ~~Uncomment `file_template` in `alembic.ini` and retroactively rename all
      35 existing files with date prefixes.~~ **Done — superseded by item 17.**
      `file_template` is already active in `backend/alembic.ini`, and the
      squash's single baseline file is already named
      `2026_08_12_0000-878bc9300d4f_initial_baseline_schema.py` — there is
      nothing left to rename.

_(recommended)_ — uncomment `file_template` in `alembic.ini`
(`%%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s`)
so new migrations become `2026_08_09_1430-<rev>_<slug>.py` and sort
chronologically in the file explorer. The prefix is **purely a human-sorting affordance** — true ordering
is always the `down_revision` chain, never the filename.
Originally: retroactively rename all 35 existing files with date prefixes
(cheap then, no live data): the revision ID lives _inside_ each module
(`revision = "…"`), and Alembic scans the directory reading each module's
`revision`/`down_revision`, so the filename is never the source of truth —
renaming cannot break the chain. Nothing to do here now — the item 17 squash
produced the single baseline file already carrying the date-prefixed name the
`file_template` config generates, so both the config change and the rename
are already in place.

### 9. `compare_server_default` — record the decision

- [x] Add a one-line comment beside the `compare_type=True` lines in `env.py`.
- [x] Record the same decision in `backend.instructions.md` (item 3).

Added a one-line comment directly beneath both `compare_type=True` lines in
`env.py` (offline and online paths) recording that `compare_server_default`
is deliberately left off. Verified with `pre-commit run --files
backend/alembic/env.py` (ruff/black/mypy/bandit all pass) and `alembic
check` inside the running container (clean, no drift) — comment-only change,
no behaviour affected.

Deliberately left **off** in `env.py` (recurring false-positive noise outweighs
the benefit at this scale; DB defaults are few). Add a one-line comment beside
the `compare_type=True` lines recording this decision so it is not mistaken for
an oversight. Record it in **two** places: the inline `env.py` comment (for
anyone reading the code) **and** a one-line note in `backend.instructions.md`
(item 3), so the rationale survives independently of the code and is discoverable
alongside the other Alembic conventions.

### 10. Revision-ID naming consistency

- [x] ~~Adopt Alembic-generated hashes for new migrations; leave existing IDs
      as-is.~~ **Moot — superseded by item 17.** The custom short IDs this
      item reconciled (`msg001`, `org001`, `cbac001`, `sp001`, `pm001`,
      `teach001`) no longer exist: the squash collapsed them all into the
      single baseline `878bc9300d4f`, which already uses an
      Alembic-generated-style hash. Nothing left to reconcile.

Originally: most migrations used autogenerated hashes, but several used
custom short IDs. Harmless, but inconsistent. **Decided then:** let Alembic
generate hashes going forward and rely on the slug for readability — do not
hand-author custom short IDs; the convention applies to new migrations only.
That convention still stands for every future migration (nothing here
changes it) — see plan item 17 for the squash that retired the custom IDs.

### 11. Set `lock_timeout` / `statement_timeout` on migrations

- [x] Execute the `SET`s at the start of `run_migrations_online` in `env.py`.

Added `connection.execute(text("SET lock_timeout = '3s'"))` and
`connection.execute(text("SET statement_timeout = '30s'"))` at the start of
`run_migrations_online` in `env.py`, before `context.configure`/
`begin_transaction`, so every migration inherits them (session-level `SET`,
not `SET LOCAL`, so it persists for the whole migration transaction on that
connection). Documented in `backend.instructions.md` (Deploy and
configuration notes) and a new section in
[Alembic migration safety](../backend/alembic-migration-safety.md).
Verified with a full `alembic downgrade base && alembic upgrade head &&
alembic check` round-trip against live Postgres (clean, no drift,
`alembic current` confirms head), the full backend unit suite via `just ub`
(all green), `mypy --strict` on `backend/app` + `env.py` (clean), and
`pre-commit run` on all touched files (clean).

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

- [x] Run `alembic upgrade head` as a separate pre-deploy Cloud Run Job.

Added a `run-migrations` action to `backend/scripts/admin_cli.py`
(`ADMIN_ACTION=run-migrations`, calls `alembic.command.upgrade(cfg, "head")`
against the `alembic.ini` already shipped in the `admin` image). `deploy.yml`
now builds and pushes the `admin` image alongside `backend` whenever backend
source changes, then runs the new `.github/scripts/deploy/run-migrations.sh`
(updates `quill-admin-{env}` to the new image, executes it with `--wait`)
**before** the `gcloud run services update` step, for both the teaching and
production stages — a failed migration now blocks the deploy instead of
crash-looping the service. Removed the migration retry loop from
`backend/docker/entrypoint.sh` (file deleted) and the corresponding
`ENTRYPOINT`/`COPY` lines from `backend/Dockerfile`'s `prod` stage — the
serving container now starts uvicorn directly. Added `just migrate-remote`
(alias `mr`) for staging (not wired into the CI deploy pipeline) or manual
re-runs. Documented in a new "Pre-deploy migration job" section in
[Alembic migration safety](../backend/alembic-migration-safety.md), updated
`backend.instructions.md` (Deploy and configuration notes), `admin.md` (new
"Run database migrations" command + a "Deploy pipeline blocked on migration
failure" troubleshooting entry), and `gcp.md`. Verified with: the full
`pytest tests/test_admin_cli.py` suite (new `TestRunMigrations` tests, mocked
`alembic.command.upgrade`, both success and failure paths) and the full
backend unit suite via `just ub` (all green); `mypy --strict` on `backend/app`

- `admin_cli.py` (clean); `pre-commit run` on all touched files (clean, after
  one ruff import-order auto-fix); `actionlint` on `deploy.yml` (clean); the new
  `run-migrations.bats` (3 tests, `gcloud` stubbed) via `just ts` (all 22 shell
  script tests green); local Docker builds of both the `prod` and `admin`
  targets (confirms no `ENTRYPOINT` override remains, and `admin`'s `CMD` is
  unchanged); and an end-to-end run of `ADMIN_ACTION=run-migrations` in the
  built `admin` image against the live dev core Postgres container (`✓
Migrations applied successfully`).

_(highest value at scale)_ — run `alembic upgrade head` as a **separate
pre-deploy step** (a Cloud Run **Job** — the `admin` image target already
exists) against the **same** core DB, **before** the new app revision is
created. Same database and same migrations; only the runner and timing change
(no new DB). Benefits: the migration runs **exactly once** (removing the
multi-instance race where several new-revision instances each run the migration
on startup), gives a clean pass/fail signal separate from app boot, and lets the
app service account drop DDL privileges (least privilege). **Adopting now**,
not deferred — the `admin` Cloud Run Job scaffold already exists in
`infra/main.tf`/`infra/modules/cloud-run-job/`, it just isn't wired to run
migrations yet.

### 13. Revision-specific smoke test

- [x] Point the deploy smoke test at the new revision's tagged, `--no-traffic` URL.

Added `.github/scripts/deploy/deploy-tagged.sh`: deploys the backend under a
unique traffic tag (`rev-{12-char short sha}` — Cloud Run caps combined tag +
service name at 46 characters, so a full 40-char SHA doesn't fit) with
`--no-traffic`
(`gcloud run services update ... --tag`), resolves that tagged revision's own
URL via `gcloud run services describe --format=json` + `jq`, smoke-tests it
(via a `run_smoke_test()` wrapper that shells out to the existing
`smoke-test.sh` — kept as a subprocess call rather than sourcing it directly,
to avoid both scripts defining a colliding `main()`), and only then promotes
with `gcloud run services update-traffic --to-latest`. `deploy.yml`'s "Deploy
backend"/"Deploy backend to production" steps in both `deploy-teaching` and
`promote-to-production` now call this script instead of a direct
`gcloud run services update`; frontend deploys are unchanged (out of scope —
backend only, per the decoupled-migration-job risk this closes). The existing
public-edge "Smoke test" steps are unchanged and still run afterwards, as a
complementary check of the live edge post-promotion. Documented in a new
"Revision-specific smoke test" section in
[Alembic migration safety](../backend/alembic-migration-safety.md) and updated
`gcp.md` (deploy-sequence bullets + a new "(done)" note; also fixed a stale
note there claiming migrations still ran via the removed container
entrypoint). Verified with: the new `deploy-tagged.bats` (5 tests — full
tag/describe/smoke-test/promote sequence, smoke-test failure blocks promote,
unresolvable tagged URL fails, tagged-deploy failure short-circuits before
describe/smoke-test, missing-argument usage error) via `just ts` (all 27 shell
script tests green); `shellcheck` on the new script (clean, same info-level
`SC1091` as sibling scripts); and `actionlint` on `deploy.yml` (clean).

Point the deploy smoke test at the **new revision's own tagged URL** (a Cloud
Run traffic **tag** deployed `--no-traffic`), not the public URL, so it verifies
the revision just shipped rather than whatever is currently serving. No
load-balancer / Caddy change is needed while `ingress = ALL`; it requires
switching the deploy to tag + no-traffic, then a promote step. **Complements**
(does not replace) the decoupled migration job and the public-edge smoke test —
the three cover different failure domains (DB change, new-revision health, public
edge). **Adopting now**, alongside item 12 — not deferred to a later,
larger-scale phase.

### 14. Client version detection / silent reload

- [x] On navigation to an explicitly safe-listed route, silently reload if the
      browser already has a newer build waiting (`registration.waiting`).
- [x] Keep the existing hourly `reg.update()` poll running as a second
      trigger, so a tab that never navigates still gets checked — but gate
      its reload on the same route-safety whitelist as the navigation trigger.

Implemented as `frontend/src/lib/swUpdateGate.ts` (pure, tested gate module:
`isRouteSafeForReload`, `checkForUpdateAndReloadIfSafe`), wired into
`frontend/src/main.tsx` on both the `router.subscribe` navigation trigger and
the existing hourly `setInterval`, with `sw.ts`'s unconditional
`self.skipWaiting()` removed. Routes across the tree (`main.tsx`) are marked
`handle: { safeForReload: true }` per the whitelist criteria below — every
read-only list/dashboard/detail view; every form, wizard, message composer,
and the in-progress exam route (`teaching/assessment/:id`) are deliberately
left unmarked (unsafe by default).

**Bug found and fixed while wiring real routes**: `isRouteSafeForReload`
originally read `match.handle` directly, but React Router's `RouteMatch`
only exposes `params`/`pathname`/`pathnameBase`/`route` — `handle` lives on
`match.route.handle`, not the match itself (confirmed via `react-router`'s
shipped `.d.ts`). The function silently always returned `false` until this
was corrected, since no route had set `handle` yet to expose the mismatch.
Fixed in `RouteMatchLike`/`isRouteSafeForReload` and the corresponding tests.

_(bounds client staleness)_ — a user's browser keeps running the bundle it
first downloaded until the tab is reloaded, so a stale client can run for days
against a moving backend. No separate version marker (e.g. `/version.json`) is
needed: `sw.ts` calls `precacheAndRoute(self.__WB_MANIFEST)`
(`frontend/src/sw.ts`), and workbox's injected `__WB_MANIFEST` lists every
hashed asset + revision, so the built `sw.js` is already byte-different on
every deploy — exactly like `index.html`. The browser's own service-worker
update algorithm already does a byte-for-byte comparison of `sw.js` on every
`reg.update()` call and surfaces the result natively as
`registration.waiting`, so the check is simply: call `reg.update()`, then read
`registration.waiting` — **on navigation to a whitelisted route, and also
once an hour via the existing timer** — no focus/visibility trigger.

**Fixes an existing live bug — this is not a greenfield addition.** `main.tsx`
currently calls `reg.update()` immediately on load and again every hour via
`setInterval(() => reg.update(), 60 * 60 * 1000)`; whenever that poll finds a
new build, `sw.ts` calls `self.skipWaiting()` unconditionally and `main.tsx`
hard-reloads on every `controllerchange`, with no regard for in-progress work
anywhere in the app. **The bug being fixed is the unconditional reload, not
the hourly cadence** — this item keeps the hourly timer (and adds the
navigation trigger alongside it) but makes both triggers respect route
safety before ever calling `skipWaiting()`/reloading.

**A single whitelist, not a whitelist-plus-blacklist.** A route is "safe" if
it is fully reconstructible from the URL alone — dashboards, list views,
settings, read-only result pages. Reloading it produces an identical page, so
nothing is lost. Mark each safe route individually via React Router's
`handle` property, e.g. `{ path: "...", element: <X />, handle: {
safeForReload: true } }`. A route with no `handle.safeForReload` is unsafe by
default (fail-safe) — a newly added route never accidentally becomes
reloadable, and there is no separate list to keep in sync with the route tree.
An in-progress exam (`teaching/assessment/:id`) simply has no `handle` set,
rather than needing separate blacklist/suppression logic.

**No prompt, ever — fully silent, gated on route safety, not user action or
dirty-state tracking.** On arrival at a whitelisted route, call `reg.update()`
and check `registration.waiting` **before the destination page renders** (not
a post-mount effect — avoids a flash of the new page before reload). If a
worker is waiting: post `SKIP_WAITING` to it and hard-reload immediately and
silently — no notification, no toast. If the route is not whitelisted,
nothing happens at all; the check simply runs again the next time the user
lands on a whitelisted route. **The hourly timer follows the same rule**: it
always calls `reg.update()`, but only acts on a waiting worker if the
currently-rendered route is whitelisted at the moment the timer fires — on an
unsafe route (e.g. mid-exam) it does nothing that tick and simply checks
again an hour later, or sooner if the user navigates to a safe route first.

**Also skip the reload if a flash message carried from the previous page is
present.** `PageMessageContext`/`PageMessageProvider`
(`frontend/src/components/page-message/PageMessageContext.tsx`) ingests
`location.state.flash` on arrival and renders it as a banner in `MainLayout`
(not a toast) — manually dismissible via a close button, but never
auto-dismissed (clinical safety). If `location.state?.flash` is present on the
incoming navigation, skip the reload check for that one navigation only — it
simply re-runs on the next one. (Implementation note: a route `loader` doesn't
receive `navigate()`'s `state` argument, so this check likely needs to live at
component level — e.g. a `useLayoutEffect`, which runs before the browser
paints, avoiding a visible flash of the new page.)

**Implementation notes (from a design review pass):**

- **Reload-loop guard.** If the newly-shipped build is itself broken, a naive
  implementation could reload, immediately re-detect the same waiting worker,
  and reload again forever. Record a flag in `sessionStorage` before
  reloading; if it is already set on a later check, do **not** auto-reload
  again for the rest of this tab session — fail silent rather than loop (a
  full tab close/reopen clears the flag and gets a fresh chance).
- **No separate marker or caching rule needed.** Because the signal is the
  browser's native SW update check rather than a fetched file, there is no
  new endpoint to worry about `Cache-Control` for. Confirmed via MDN/web.dev:
  `navigator.serviceWorker.register()`'s `updateViaCache` option defaults to
  `"imports"`, meaning the **main `sw.js` script always bypasses the HTTP
  cache on every update check**, regardless of any `Cache-Control` header on
  it. Caddy currently sets no explicit header on `/sw.js` (it matches neither
  the `@hashed` nor `@html` matchers in `caddy/prod/Caddyfile`), but no Caddy
  change is needed: nothing else in the stack (no CDN in front of the
  frontend service, no other code path fetching `/sw.js` directly) would ever
  read that header, so adding one would protect against nothing currently
  possible. Separately confirmed: the oft-cited
  "24-hour" throttle only limits **implicit** update checks (navigation
  without an explicit call, `push`/`sync` events) — **explicit `reg.update()`
  calls are never throttled**, so calling it on every safe-route navigation
  always gets a fresh check.
- **Gate on build mode, not environment.** Gate the whole check behind
  `import.meta.env.PROD` — Vite's dev-mode HMR (hot module replacement)
  changes module content constantly and would otherwise trigger constant
  false mismatches locally. This is `true` for **both** teaching and
  production (`frontend/Dockerfile`'s `build`/`prod` stages run `yarn build`
  for both — the only difference between the two is env vars baked in at
  build time, e.g. `VITE_CLINICAL_SERVICES_ENABLED`); it is `false` only for
  local `yarn dev` (the `dev` stage).
- **Fail closed on check errors.** A failed `reg.update()` call (network
  blip, offline) must never be treated as a detected update — only a
  successful check with `registration.waiting` populated can trigger a
  possible reload.
- **Push notifications are unaffected.** `sw.ts`'s `push`/`notificationclick`
  handlers are a separate concern from the update/reload flow. Push
  subscription state lives server-side (`backend/app/push.py`), tied to the SW
  registration, not to page/React state — a reload doesn't touch it. Removing
  the unconditional `self.skipWaiting()` is safer than the current behaviour:
  the old SW instance keeps handling `push` events for as long as it remains
  active, right up until the safe-navigation trigger hands control to the new
  one.
- **Accepted, out of scope:** multiple open tabs behave independently (one tab
  may reload before a sibling does) — not dangerous, just per-tab. A user who
  stays on the same unsafe route for an entire tab session simply never gets
  a reload — nothing is forced without either navigating to, or already being
  on, a whitelisted route.
- **Explicitly out of scope for this pass:** mandatory-withdrawal escalation
  (any-navigation trigger + blocking modal for emergency build withdrawal) —
  a real DCB0129-relevant control, but a separate, rare mechanism, deferred;
  focus/visibility-change-triggered checks — over-engineering for the
  practical benefit; Web Push/WebSocket-based instant notification to idle
  tabs — confirmed no WebSocket infrastructure exists anywhere in
  `backend/app/**` (only a transitive `websockets` dependency via uvicorn's
  `[standard]` extras).
- **No post-reload toast.** Considered a brief "Updated to the latest version"
  toast purely as reassurance after a silent reload; **declined** — stays
  fully silent end-to-end.

**Decided: adopt as standard for the production product** — silent,
whitelist-gated (route `handle`) reload, triggered both on navigation to a
safe route and by the existing hourly timer; no prompt, in either case.

### 15. Backwards-compatible API windows

- [x] Document and enforce an additive-only / deprecate-then-remove API
      compatibility policy so stale clients keep working.
- [x] CI schema-diff check (`oasdiff`) fails the build on an undeclared
      breaking change; the only way to declare one intentional is a required
      GitHub Actions environment approval (Slack-notified) — not a code
      comment, commit trailer, or PR label.

Implemented in commit `f1ed1ef` ("feat: enforce API expand-contract
compatibility (item 15)"). Policy documented in three places: a new "API
compatibility (expand-contract)" section in `backend.instructions.md`
(mirroring item 3's DB section), a cross-referencing bullet in
`copilot-instructions.md`, and a new docs page
[API compatibility (expand-contract)](../backend/api-compatibility.md)
(linked from `mkdocs.yml`) carrying both the rule and the full reasoning.
CI enforcement: the `heavy_api_schema_diff` job in `ci.yml` generates the
OpenAPI spec from both `main` and the PR branch
(`backend/scripts/dump_openapi.py`) and runs `oasdiff breaking` via
`.github/scripts/ci/check-api-breaking-changes.sh` (tested in
`check-api-breaking-changes.bats`), with `oasdiff` itself installed via a
checksum-verified `install-oasdiff.sh`. On a detected breaking change,
`heavy_api_breaking_change_notify` posts to Slack (`channel: teaching`) and
`heavy_api_breaking_change_gate` requires approval on the new
`api-breaking-change-review` GitHub Actions environment
(`prevent_self_review = false`, by design — see rationale below) before the
check passes. Both job names were added as required status checks in
`infra/github/branch_rules.tf`; the environment and its reviewer
(`Cotswoldsmaker`) are defined in `infra/github/environments.tf`.
**Terraform not yet applied** — these Terraform changes are committed but
`terraform apply` has not been run, so the required checks are not yet
enforced on the repo.

_(client-side expand-contract)_ — treat every API response shape and required
request field as a contract that stale clients still depend on during (and
beyond) the rolling-deploy window. **Additive changes only** within a
compatibility window: adding an optional response field is safe; renaming,
removing, or retyping a field, or adding a **required** request field, is a
breaking change that must be staged — add the new shape alongside the old,
migrate clients, then remove the old shape after **N releases** of deprecation.
This mirrors the database expand-contract rule on the client boundary.

**Enforcement: automated schema diff + a human gate an agent can't
self-satisfy.** A `# api-check: breaking-change` code comment, a
`BREAKING CHANGE:` commit-message trailer, and a PR label were each
considered and rejected in turn — all three are just text/metadata that an AI
coding agent produces as routinely as the code itself, so none of them prove
a human actually decided the change was intentional. A code comment has a
second flaw even setting that aside: unlike an Alembic migration file (write
once, reviewed once, never revisited), application source is edited
repeatedly forever, so a marker added for one breaking change sits there
permanently and can silently "cover" an unrelated, unreviewed change to the
same endpoint months later. A second-reviewer requirement (CODEOWNERS +
required PR review) was also considered and **rejected on principle, not
just team size**: design for the lowest common denominator — a lazy human —
and a second reviewer is not inherently more careful than the person who
wrote the change; a fresh or rushed reviewer can rubber-stamp an approval
just as easily as the author can, so adding a second person is not a real
safety gain on its own. The gate below is deliberately built so **the author
themself** is the accountable approver — the goal is forcing one genuine,
separate, deliberate action out of whoever is accountable, not diffusing
accountability across more people who could each be equally lazy.

- **Schema diff**: `oasdiff breaking` compares the OpenAPI spec generated from
  `main` (`backend/scripts/dump_openapi.py`) against the spec generated from
  the PR branch, in CI. Chosen over hand-written contract tests because it
  needs no test authoring per endpoint — it diffs the full spec on every PR
  automatically. Verified: `oasdiff`'s source-location tracking only maps a
  change back to a line/column **inside the OpenAPI spec file itself**, not
  into the Python source that generated it, and only works when the spec is
  parsed as YAML (ours is generated JSON, so no line/column is available
  regardless) — so the check can only be "was _any_ breaking change found",
  never "which exact source line caused it".
- **Human gate**: a breaking-change finding routes the workflow through a
  required-reviewer **GitHub Actions environment**
  (e.g. `api-breaking-change-review`) with the repo owner (the author) as the
  sole reviewer — **by design, not just because there's no second developer
  yet**: see the accountability reasoning above. "Prevent self-review" stays
  **off**. Approving is a distinct action in the GitHub Actions UI/mobile
  app — less reachable from an agent's terminal/editor session (it would need
  your logged-in browser or phone) — and it is scoped to the exact commit SHA
  of that workflow run, so a new push always requires a fresh approval;
  nothing "left over from 100 commits ago" can satisfy it.
- **Notification**: post to Slack (via the existing reusable
  `.github/workflows/slack-notify.yml`, `channel: teaching` — reusing the
  existing webhook, no new secret needed) when a breaking change is detected,
  including `oasdiff`'s changelog summary of what changed, so the approval
  prompt shows _what_ is being confirmed rather than a bare "approve?".

Largely a **documented discipline + review gate** (record it in
`backend.instructions.md`, item 3) reinforced by the CI schema-diff check
described above.
**Decided: additive-only within the window; breaking changes staged over N
releases; enforced via `oasdiff` in CI plus a required-reviewer GitHub
environment gate (Slack-notified) — not a code marker, commit trailer, or
label.**

- [x] Prove the chain end-to-end with a real example, then keep it
      exercisable on demand without ever touching a real production schema
      again.

**Proven via PR [#379](https://github.com/bailey-medics/quillmedical/pull/379)**
(branch `feature/throwaway-api-breaking-change-proof`): a deliberate breaking
change (removing `UserCompetenciesResponse.final_competencies` on both `GET`
and `PATCH /api/cbac/my-competencies`) exercised the whole chain — and
surfaced a genuine, previously-undetected bug in the mechanism itself:
`oasdiff breaking` only _reports_ findings and always exits `0` unless
`--fail-on` is passed, so `check-api-breaking-changes.sh`'s exit-code check
was dead code — `breaking` was always written `false`, meaning the
`api-breaking-change-review` gate and the Slack notification could **never
fire**, no matter how breaking a real change was. Fixed by passing
`--fail-on WARN` (matches `oasdiff breaking`'s own ERR/WARN detection
scope); verified locally with a synthetic spec pair, then live in PR #379's
CI — `breaking=true` was written correctly, Slack fired, and the
`api-breaking-change-review` gate went to `waiting` for approval. Two
further gaps found while reviewing the proof were fixed in the same PR: the
oasdiff report is now also written to `$GITHUB_STEP_SUMMARY` on a breaking
finding (so the approver sees exactly what changed on the same page as the
"Review pending deployments" prompt, without digging through job logs), and the
Slack message now points the approver at the run summary and the "Review
deployments" button rather than a bare "View Run" link. The deliberate
schema change and its two `api-compatibility/` decision files were reverted
before merge — PR #379 shipped only the CI/CD fixes.

**Follow-up decided, not yet built**: see item 19 below for the full plan —
a permanent, flag-gated pair of dummy test endpoints so the chain can be
re-exercised on demand without ever touching a real endpoint again.

- [x] Close the client-side half of the compatibility window: a stale tab
      must be forced onto a new bundle before an _approved_ breaking change
      goes live, not just eventually.

**Done — the sub-plan's implementation checklist is now fully complete:**
see [2026-08-09-sub-plan-api-compatibility-plan.md](2026-08-09-sub-plan-api-compatibility-plan.md)
for the `api-compatibility/` decision-file mechanism, the `generation` /
`Compat-Generation` header, and the forced-reload flow that closes this
gap. The only item in that sub-plan not implemented — deploy-pipeline
health-check gating for the frontend, and delaying `Compat-Generation`
until the frontend bundle is confirmed live — was reviewed and
deliberately deferred: `forces_reload: true` deploys are rare, the
client-side retry/fallback logic already self-heals within one 5-minute
cycle with no data loss, and production is currently disabled, so this
ordering risk is accepted rather than engineered around for now.

**Why a stale tab is a real risk, not a theoretical one**: refresh tokens
rotate on every use (`main.py`, `/api/auth/refresh`), so a tab kept alive by
routine use never hits the 7-day refresh TTL and never re-logs-in — and
because this is a client-routed SPA, re-login is the only thing that would
otherwise force a fresh page load. A tab can genuinely stay open for 30+
days on the bundle it started with.

**What's already in place, and what item 14 changes it to**: today `main.tsx`
polls `reg.update()` hourly and force-reloads unconditionally. **Item 14
above keeps that hourly timer** but stops it reloading unconditionally —
both the hourly timer and a new navigation trigger now only act when the
currently-rendered route is whitelisted — this item builds on **item 14's
decided design** (hourly timer + navigation trigger, both whitelist-gated).

**No separate fast path — the API-side expand-contract staging is what
actually closes the window, not a faster client check.** A faster detection
path was considered (piggybacking version detection onto
`ConnectivityContext.tsx`'s health poll), but that poll **only runs while
`isOnline` is false** — a normal, working-but-stale tab is exactly the case
where it never fires, so there is nothing to extend, and it would still only
be a race against the clock either way. The real fix is the same
**expand-contract mirroring** already decided at the top of this item:
a breaking change is never shipped as a single deploy — it always ships as
two:

1. **Expand deploy**: the new shape goes live **alongside** the old one; both
   are served simultaneously, so an old, stale tab keeps working exactly as
   before — nothing about this deploy is "breaking" for anyone yet.
2. **Contract deploy**: the old shape is removed, **at least one full
   release cycle later** (the "N releases of deprecation" already decided
   above) — never in the same deploy as the expand step, and never sooner
   than a release cycle.

Because item 14's hourly timer fires **regardless of navigation** (and the
navigation trigger closes the gap further for tabs that move between
whitelisted routes), and a release cycle spans many days of ordinary use,
every tab has had numerous opportunities — timer-driven, not just
navigation-driven — to pick up the expand deploy well before the contract
deploy ships. The risk window is closed by the **staging gap**, reinforced
by (not solely dependent on) the hourly check. This is exactly the same
reasoning as the database's expand-contract rule (item 1's Part 1 write-up)
applied to the API boundary instead of the schema. (A tab that stays on an
unsafe route for an entire release cycle, never once landing on a
whitelisted route while the hourly timer fires, is already an accepted,
out-of-scope edge case per item 14's decision.)

- **Routine (additive) deploys, and expand-step deploys**: item 14's
  behaviour, unchanged — silent `skipWaiting()` + reload on the next
  whitelisted-route check (hourly timer or navigation, whichever is first),
  no message.
- **Contract-step deploys (the one point of actual client risk)**: same
  hourly-timer-or-navigation, whitelist-gated check, same reload — the only
  difference is a short, non-dismissible "Updating to the latest version…"
  banner shown for a few seconds before reloading, since this is the one
  deploy users should be told about rather than have happen silently. Gate
  the banner on the same breaking-change signal from the enforcement
  mechanism above; it is reassurance for a risk the staging has already
  eliminated, not the thing eliminating it.

- [x] Build the "Updating to the latest version…" banner as a proper
      Storybook component — `.stories.tsx` + `.test.tsx` alongside it — not
      inline JSX bolted onto the reload-trigger code. **Mounted only for the
      forced/contract-step reload path** — routine and expand-step reloads
      stay fully silent per item 14 and never render this banner.

Implemented as `components/updating-banner/UpdatingBanner.tsx` — pure
presentational, no props, no internal state or timer, following the
`OfflineStrip` precedent exactly (`role="status"`, `aria-live="polite"`,
composed from `Icon`/`BodyTextInline`, `var(--info-color)` accent,
`IconRefresh` from the existing icon registry). `UpdatingBanner.stories.tsx`
covers the default state and dark mode (rendered inside `MainLayout`, per
the `OfflineStrip` stories pattern). `UpdatingBanner.test.tsx` asserts the
copy renders, `role="status"`/`aria-live="polite"` are present, and no
button/dismiss control exists. Verified with `just uf
src/components/updating-banner` (4/4 passing) and `yarn eslint` +
`tsc --noEmit` (both clean) inside the frontend container. **Not yet
wired up** — nothing mounts this component yet; that is the separate
"close the client-side half" item below. The design for how the
reload-trigger code learns a given reload is a contract-step one is now
specified in
[2026-08-09-sub-plan-api-compatibility-plan.md](2026-08-09-sub-plan-api-compatibility-plan.md)
(the `Compat-Generation` runtime signal), which this component should be
reused/extended for rather than wired up ad hoc.

**Follow the existing `OfflineStrip` precedent, don't invent a new pattern.**
`components/offline-strip/OfflineStrip.tsx` is exactly this shape already: a
pure presentational, full-width strip with `role="status"`/`aria-live="polite"`,
visibility and content fully controlled by the caller via props (no internal
timers, no dismiss button) — the same non-dismissible, "just tell the user
something is happening" contract this banner needs. Per
`components.instructions.md`'s reuse hierarchy, compose from what exists
(`Icon`, `BodyTextInline`/typography components) rather than building from
scratch.

- **Component**: a new `components/updating-banner/UpdatingBanner.tsx` (or
  similar), pure presentational — a `visible: boolean` prop (or simply
  mounted/unmounted by the caller), no internal state, no close button, no
  auto-dismiss timer of its own (the reload-trigger code controls the whole
  lifecycle: show → wait a few seconds → reload). The reload-trigger code
  only mounts it when the breaking-change/contract-step signal is set —
  routine and expand-step reloads never mount it, so there is no prop or
  mode for a "routine" variant to build or test.
- **Story**: default state, plus dark mode, following the "loading/skeleton
  last, dark mode after" story ordering convention; use `StoryNote` for any
  explanatory text.
- **Tests**: renders the "Updating to the latest version…" copy (sentence
  case, British English); exposes `role="status"`/`aria-live="polite"` for
  screen readers; renders no dismiss/close control (unlike
  `PageMessageProvider`'s flash banners, this one is never manually
  dismissible); snapshot/behaviour only — no reload/timer logic lives in the
  component itself, so nothing to fake-timer test here (that belongs to the
  reload-trigger unit tests in Group A below).

**Decided: no new polling mechanism, and no bare "single breaking deploy" —
every breaking change ships as an expand deploy then a contract deploy at
least one release cycle later (mirroring the DB expand-contract rule), which
gives item 14's hourly-timer-and-navigation check ample opportunity to have
already refreshed every stale tab before the contract deploy. Add a short
notify-then-reload banner on the contract deploy only, as reassurance, not
as the mitigation — routine and expand-step deploys stay fully silent, per
item 14.**

- [x] Document the API expand-contract rule explicitly — for human
      developers **and** AI coding agents — not left implicit in this plan
      doc alone.

Implemented alongside the checks above, in the same commit (`f1ed1ef`):
`backend.instructions.md` gained the new named "API compatibility
(expand-contract)" section (sibling to item 3's DB section),
`copilot-instructions.md` gained the short cross-referencing bullet under
"Backend (FastAPI)", and
[API compatibility (expand-contract)](../backend/api-compatibility.md)
carries both the rule and the full reasoning (the refresh-token
stale-tab risk, why a single-deploy breaking change is unsafe, and why item
14's hourly-timer-and-navigation check is sufficient given the
release-cycle gap) — exactly as decided below.

**Why this needs its own item, not just item 16's general cadence**: item 3
gave the DB expand-contract rule its own named section in
`backend.instructions.md` precisely so it reads as a standing convention,
not a one-off decision buried in a planning doc. The API-side rule decided
above (additive-only; breaking changes ship as expand-deploy-then-
contract-deploy, never one deploy; the `oasdiff` + environment-approval
gate) deserves the same treatment — otherwise a future change (human- or
agent-authored) can reintroduce a single-deploy breaking change simply
because nothing in the day-to-day instructions said not to.

- **`backend.instructions.md`**: add a new **"API compatibility
  (expand-contract)"** section, sibling to the existing "Expand-contract and
  NOT NULL columns" section, stating: additive-only within the compatibility
  window; a breaking change is never a single deploy — expand first,
  contract only after **N releases**; the `oasdiff` CI check and the
  `api-breaking-change-review` environment gate are how "intentional" gets
  declared, not a comment/trailer/label. This file's `applyTo: "backend/**"`
  frontmatter already makes it load automatically for any AI agent touching
  backend code — the same mechanism that already makes the Alembic rules
  visible.
- **`.github/copilot-instructions.md`**: add a short cross-referencing
  bullet under "Backend (FastAPI)" (this file loads for **every** task,
  unscoped, unlike `backend.instructions.md`) so the rule surfaces even when
  the change starts on the frontend side (e.g. a frontend PR consuming a
  new/changed endpoint) — "API changes: additive-only; breaking changes
  need the expand-contract two-deploy pattern — see
  `backend.instructions.md`."
- **Docs page** (`docs/docs/`): both the rule (additive-only; expand deploy
  then contract deploy after **N releases**; `oasdiff` + environment-approval
  gate) **and** the full reasoning — why a single deploy is unsafe, the
  refresh-token/stale-SPA-tab risk, and why item 14's hourly-timer-and-
  navigation, whitelist-gated check is sufficient given the release-cycle
  gap — per item 16's decision to carry both in the docs page rather than
  splitting them.

**Decided: `backend.instructions.md` gets a new named section (mirroring
item 3's treatment of the DB rule), `copilot-instructions.md` gets a short
cross-referencing bullet so it surfaces on frontend-only changes too, and
the docs page carries both the rule and the full reasoning (duplication with
`backend.instructions.md` accepted, per item 16).**

### 16. Documentation cadence — update the rules and docs as each item lands

- [x] For every item above, its discrete unit of work also updates
      `.github/instructions/backend.instructions.md` (the enforceable rules) and
      the migration-safety docs page (`docs/docs/`, the reasoning), then hands
      off for human review per `follow-the-plan.document.prompt.md`.

Confirmed — this cadence held for every completed item (1–15, 17); each
item's write-up above records exactly what was added to
`backend.instructions.md` and the docs page at the time. Item 18 is
verification-only (no new rule or reasoning to document) once it lands.

_(applies to every item — not a final batch)_ — documentation is not deferred to
the end. Each item ships as a self-contained unit that, alongside its code and
tests, updates **both** durable artefacts while the detail is fresh: the LLM
instructions file (`backend.instructions.md`) carries the enforceable _rule_ the
item establishes, and the docs page (`docs/docs/`) carries **both the rule and
the why** — a human reading the docs page alone should get the full picture,
not just the reasoning with a link off to `backend.instructions.md` for the
rule itself. The item is then presented for human review (the review gate in
`follow-the-plan-document.prompt.md`) before commit. **Deliberately accepting
duplication** of the rule text between the two artefacts (rather than the docs
page linking to `backend.instructions.md` to avoid restating it) — a separate,
existing prompt already checks the docs against the code for consistency, so
drift between the two is caught rather than silently accumulating, and the
duplication cost is worth a docs page that stands on its own. Because each item
carries its own documentation, the reasoning is captured while it is vivid
rather than reconstructed at the end, and by the time the last item lands both
the rules file and the docs page are already complete and reviewed — no final
documentation batch is needed. This planning document becomes the historical
record; the docs page is the living reference.

Cover, cumulatively across the items: how migrations run on deploy and how a
failure is contained (expand-contract + roll-forward, no downgrades); the
`check_migrations.py` checks and the pre-commit / CI wiring; the
autogenerate-drift check; the `lock_timeout` / `statement_timeout` settings; the
`compare_server_default` off decision; and the client-version / API-compatibility
safeguards.

### 17. Squash the migration history to a single baseline — separate plan

- [x] Collapse all 35 core-DB migrations into one baseline migration, pre-launch,
      while there is no live data. **Tracked in its own plan file:**
      [Alembic migrations squash plan](2026-08-11-migrations-squash-plan.md).
      _Implemented on `feature/squash-migrations`:_ the chain is now the single
      baseline `878bc9300d4f`, and `check_migrations.py`'s allow-list is empty.

_(pre-launch cleanup — no live data)_ — because there is no production or staging
environment and teaching holds only disposable developer data, the entire legacy
chain can be replaced by a single baseline autogenerated from the current models.
This retires the grandfathered debt wholesale: it **supersedes** item 6 (backfill
empty descriptions), largely moots items 7–8 (only the baseline remains to format
/ prefix), and lets `check_migrations.py` drop its 35-revision allow-list
entirely (the baseline meets the full standard on its own). The
`b66133f32f7b` index-rename migration folds into the baseline. The work is
sequenced **after** the migration-safety tooling (items 1–5) merges to `main`, so
the squash builds on the merged checker, `just migrate` fix, and
`backend.instructions.md`. Full steps, risks, and tests live in the separate
squash plan file linked above.

### 18. Verify the tagged-deploy path against a real backend change

- [ ] Confirm `deploy-tagged.sh` actually deploys, smoke-tests, and promotes a
      real `backend/**` change end-to-end in teaching (not just skipped-step
      "success").

Three bugs surfaced only once item 12/13's work actually tried to ship,
none caught by pre-merge CI:

- **CI seed failure**: `compose.ci.yml`'s ephemeral core Postgres was never
  migrated once item 12 removed the container entrypoint's
  `alembic upgrade head` — `seed_ci.py` failed with
  `UndefinedTable: relation "users" does not exist`. Fixed by adding an
  explicit `docker exec ci_backend alembic upgrade head` step in `ci.yml`
  before seeding.
- **Deploy failure #1**: `deploy-teaching`'s `actions/checkout` ran **after**
  `google-github-actions/auth`, and checkout's default clean wiped the
  credential file auth had just written to `$GITHUB_WORKSPACE`, failing with
  "Failed to load credential file". Fixed by reordering the steps (checkout
  first, matching every other job in this workflow).
- **Deploy failure #2**: the tagged-deploy's traffic tag `rev-{sha}` used the
  full 40-char SHA — Cloud Run rejects `--tag` once tag + service name
  exceeds 46 characters combined (`rev-<40-char-sha>` +
  `quill-backend-teaching` = 66). Fixed by shortening the tag to a 12-char
  SHA prefix.

Merged via PR
[#367](https://github.com/bailey-medics/quillmedical/pull/367) (CI fix) and
[#368](https://github.com/bailey-medics/quillmedical/pull/368) (both deploy
fixes). **Not yet verified end-to-end**: every deploy trigger since has only
contained workflow/doc changes, so `backend_changed` evaluated `false` and the
actual migration/backend-deploy steps were skipped each time (the "success"
conclusion on those runs is a false positive for this item's purposes) — the
tagged-deploy path itself has not yet been exercised against a real
`backend/**` change. To be tested on the next backend-touching merge (or a
manual `workflow_dispatch`, only with explicit go-ahead).

### 19. Permanent API-compatibility test harness (toggle test endpoints)

- [ ] Add two permanent, flag-gated dummy backend endpoints so the full
      oasdiff/api-compatibility chain (fixed in PR #379, item 15) can be
      re-exercised on demand, without ever touching a real production
      schema again.

**Key research finding (relevant to Phase 3):** `validate-compat-files.sh`'s
immutability (rule 5a) and no-deletions (rule 5b) checks both diff
`origin/main...HEAD` (merge-base compare). Anything a PR adds and only that
same PR ever removes never appears in `main`'s tree at any point, so
neither rule ever fires for content that never gets merged — which is
exactly Phase 3's situation below, since a correctly-rejected gate blocks
that PR from merging at all.

**Three-phase design.** Within a single _unmerged_ PR, "main" never moves —
so a brand-new endpoint introduced and mutated all within one unmerged PR
always diffs as "endpoint added" (non-breaking), never a genuine "property
removed from an existing endpoint" breaking change. The baseline shape must
already be on `main` before a mutation is diffed. Hence **Phase 1** merges
the baseline first. **Phase 2** (branched off the updated `main`) walks
through the no-decision-file, partial-coverage, full-coverage, and
gate-approve scenarios and **merges to `main`** once approved — the
decision files created along the way become a permanent, legitimate record
of an approved (test) breaking change, exactly like a real one, and the
mutated endpoint shape becomes the new committed baseline (no
revert/cleanup — nothing to undo). **Phase 3** (a separate, later PR
branched off that merge) proves the gate-**reject** path on a fresh
mutation; since a rejected required check structurally can never merge,
that PR is closed without merging, mirroring PR #379's disposable pattern —
nothing it creates ever needs deleting from `main`'s perspective, since
none of it lands there.

**Scope: the 4 core scenarios + gate-reject only** — not the other 8
`validate-compat-files.sh` rules, not WARN-vs-ERR severity (see "explicitly
out of scope" below).

#### Phase 1 — toggle + baseline endpoints (real, reviewable, merges first)

- [x] `backend/app/config.py`: add `TEST_API_ENDPOINTS_ENABLED: bool = False`
      (matches the existing `_ENABLED` suffix convention, e.g.
      `CLINICAL_SERVICES_ENABLED`).
- [x] New file `backend/app/test_api_endpoints.py`:
  - `TestNonBreakingResponse(BaseModel)` / `TestBreakingResponse(BaseModel)`
    — both `{message: str}` initially.
  - `test_api_router = APIRouter(prefix="/test", tags=["test"])`, nested
    under `main.py`'s existing `/api`-prefixed `router` (the same pattern
    already used for `teaching_router`) — giving the same final paths as
    originally planned below, without a doubled `/api` prefix.
  - `GET /api/test/non-breaking-api` → static
    `"This is a test response from the non-breaking api"` — a control
    endpoint, **never mutated** in Phase 2, proving unrelated endpoints are
    unaffected during a breaking-change PR.
  - `GET /api/test/breaking-api` → static
    `"This is a test response from the breaking api"` — the endpoint whose
    schema gets deliberately mutated per scenario in Phase 2.
- [x] `backend/app/main.py`: conditionally register —
      `if settings.TEST_API_ENDPOINTS_ENABLED:
router.include_router(test_api_router)`. Absent from the live app and
      its real OpenAPI spec whenever the flag is `False` (i.e. every real
      deployment, always).
- [x] `.github/workflows/ci.yml`: in `heavy_api_schema_diff`'s two "Dump ...
      OpenAPI spec" steps (PR-branch dump and main-branch dump), add
      `env: TEST_API_ENDPOINTS_ENABLED: "true"`. This is what makes the
      endpoints permanently diffable by oasdiff regardless of the app's real
      default — future test rounds need zero further CI changes.
- [x] Backend tests in `backend/tests/` (new small test file): 404 when the
      flag is `False` (default); 200 + expected body when `True` (override
      the settings dependency in the test).

Implemented as `backend/tests/test_test_api_endpoints.py`: a config-level
test that `TEST_API_ENDPOINTS_ENABLED` defaults to `False`; two tests using
the standard `test_client` fixture (built from the real app, flag left at
its default `False` in the test env, exactly matching every real
deployment) proving both `/api/test/*` paths 404 since the routes don't
exist at all; and two tests mounting `test_api_router` directly on a
throwaway `FastAPI()` instance (the same way `main.py` mounts it when the
flag is `True`) proving each endpoint's response body. This avoids a
fragile `importlib.reload` of `app.main`/`app.config` just to flip the
flag for a single test — the one-line conditional in `main.py` is
self-evidently correct and is also exercised for real by CI's `--dev`
OpenAPI dump. All 5 tests pass (`just ub -k test_test_api_endpoints`);
ruff/black/mypy --strict/bandit/cspell all clean via `pre-commit run
--files`. Confirmed unaffected: re-ran the full suite with our changes
stashed out and reproduced the same pre-existing, unrelated failures
(`test_auth.py::TestRegister::*`, `test_clinical_services.py::...
test_patients_returns_503` — both fail against a real outbound call to an
unreachable `fhir` host in this dev container, nothing to do with this
change).

- [x] Verify locally: `TEST_API_ENDPOINTS_ENABLED=true poetry run python
scripts/dump_openapi.py --dev` (inside the `quill_backend` container)
      and confirm both endpoints appear in the generated spec.

The dev container only mounts `backend/` (not the whole repo), so the
script's `--dev` file-write path (`docs/docs/code/swagger/openapi.json`,
resolved relative to a repo root that doesn't exist inside this container)
isn't reachable locally the way it is in CI (which checks out the full
repo). Verified the equivalent, and more targeted, thing instead: imported
`app.main.app` directly inside the container with
`TEST_API_ENDPOINTS_ENABLED=true` and printed `app.openapi()["paths"]` —
both `/api/test/non-breaking-api` and `/api/test/breaking-api` present;
repeated with the flag unset (this container's default) — neither path
present. Exercises the identical import/route-registration code path the
script itself relies on.

- [x] Commit, push, open a PR, get it reviewed and merged to `main`.

**Phase 1 Complete** (commit 23b260ea): All pre-commit checks passed (ruff, black, mypy --strict, bandit, cspell, gitleaks). Backend unit tests: all 10 tests passed (`test_test_api_endpoints.py`). Pre-existing unrelated failures remain (`test_auth.py`, `test_clinical_services.py` — FHIR connectivity issues). PR #383 merged to `main`. Baseline endpoints now live on `main`; Phase 2 ready to begin.

#### Phase 2 — no-decision-file, partial-coverage, full-coverage, gate-approve (branch off updated main; depends on Phase 1 merged; this PR merges to `main`)

Branch from latest `main`. Each scenario is a separate commit; push and
check `gh pr checks <n>` / job logs after each. **This PR merges to `main`
once the gate-approve scenario is proven** — no revert or cleanup step:
the decision files created along the way become a permanent, legitimate
record of an approved (test) breaking change, exactly like a real one, and
`TestBreakingResponse`'s mutated shape becomes the new committed baseline.

- [ ] **No decision file**: mutate `TestBreakingResponse` to drop/rename its
      one field (a `response-required-property-removed`-style change on
      `GET /api/test/breaking-api`). Add **no** `api-compatibility/*.yaml`
      file. Push. Expect: `API breaking-change check` job **fails** on the
      coverage rule; capture the exact error text and whether the PR checks
      UI surfaces it clearly. Then push a follow-up commit adding the
      matching decision file (via `backend/scripts/new_compat_decision.py`,
      run on host) and confirm the job goes green — proving the "add
      decision file, push again" recovery loop works end-to-end.
- [ ] **Partial coverage**: extend the mutation so `TestBreakingResponse` has
      TWO breaking changes at once (e.g. drop two fields), but add a
      decision file for only one. Push. Expect: coverage rule still fails,
      and the error specifically names the one remaining undeclared change
      (verifies message quality for partial misses, not just a generic
      failure).
- [ ] **Full coverage**: add the second matching decision file. Push.
      Expect: `API breaking-change check` passes (`breaking=true`), Slack
      notification fires, `API breaking-change review gate` goes to
      `waiting`.
- [ ] **Gate approve**: approve the `api-breaking-change-review` environment
      deployment (via Actions UI, or `gh api -X POST
repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments` with
      `state: approved`). Expect: gate job succeeds, all required checks
      green.
- [ ] Merge this PR to `main`.

#### Phase 3 — gate-reject (separate, later PR branched off the Phase 2 merge; never merged)

A fresh breaking mutation is needed here — gate approval is scoped to an
exact commit SHA, and Phase 2 already consumed that approval on its own
commit.

- [ ] Mutate `TestBreakingResponse` again (a further field removal/rename)
      and add its matching decision file, so `API breaking-change check`
      passes and the gate reaches `waiting` — same recipe as Phase 2's
      full-coverage step, just a fresh change.
- [ ] **Gate reject**: this time, **reject** the `api-breaking-change-review`
      environment deployment (Actions UI, or `gh api -X POST
repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments` with
      `state: rejected`). Expect: gate job fails/rejected, required check
      red, PR correctly and permanently blocked from merging. (This path
      has never been tested before — only approve was proven in PR #379.)
- [ ] Since a rejected required check structurally can never merge, close
      this PR without merging — mirrors PR #379's disposable pattern. No
      revert/cleanup needed: nothing this PR creates ever lands on `main`.

#### Human review — Phase 2 manual GitHub walkthrough

As you walk through each Phase 2 scenario in GitHub, tick the boxes below:

- [x] **Scenario 1 (no decision file)**: PR created, CI running. `API breaking-change check` detects the breaking change and **fails** with coverage error (gate never reached). Capture the exact error message.

- [x] Add decision file via `backend/scripts/new_compat_decision.py` and push. Verify `API breaking-change check` goes green and gate goes WAITING.

- [x] **Scenario 2 (partial coverage)**: Extend mutation to TWO breaking changes (e.g. `MUTATE_REMOVE_MESSAGE_1 = True` and `MUTATE_REMOVE_DETAIL_1 = True`). Add decision file for only the first. Push. Verify `API breaking-change check` fails with specific error naming the second undeclared change (validates error message quality).

- [ ] **Scenario 3 (full coverage)**: Add second decision file. Push. Verify `API breaking-change check` passes, `breaking=true`, Slack notification fires, `API breaking-change review gate` transitions to WAITING.

- [ ] **Scenario 4 (gate approve)**: Approve the `api-breaking-change-review` environment deployment via GitHub Actions UI (or `gh api -X POST repos/bailey-medics/quillmedical/actions/runs/{run_id}/pending_deployments` with `state: approved`). Verify gate transitions to SUCCESS, all required checks green.

- [ ] **Merge Phase 2 PR**: All checks pass, no blockers. Merge to `main`. Decision files and mutated endpoint shape now committed as permanent baseline.

**Explicitly not to be done:** the other 8
`validate-compat-files.sh` rules as individual test scenarios — stale
change string, duplicate generation numbers, generation-range violation,
editing an immutable field, deleting an existing decision file, empty
`reason` field, non-scalar `change` field, filename-regex mismatch; the
WARN-vs-ERR severity distinction (confirming a WARN-only oasdiff finding
also routes through the gate, not just ERR); draft-PR/heavy-tier-skip
behaviour (already witnessed/understood via PR #379, not re-tested).

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
- **Automated regression tests for item 7/17's one-time reformat and
  squash** — a test proving `alembic history`/`alembic heads` were
  unchanged before/after the reformat, and a `pg_dump --schema-only`
  before/after comparison proving the squash changed nothing structurally.
  **Decided against, for the same reason as the round-trip test above.**
  Both were one-time historical events (item 7's cosmetic type-hint
  reformat and item 17's migration-history squash), already merged and
  manually verified at the time (`alembic downgrade base && alembic
upgrade head && alembic check` round-trips, `pg_dump` comparisons, full
  `just ub` runs — all clean). Neither event will recur, so a permanent
  automated test would guard against a mistake that can only have happened
  once and already didn't. Not worth the ongoing CI cost for a risk that no
  longer exists.

## Part 4 — Tests: proving it works and nothing broke

Each change ships with tests. **Group A** proves the new tooling works;
**Group B** proves the existing migration history and the deploy path are
unbroken; **Group C** covers the deploy-infrastructure items (12–13). Backend
tests run in Docker (`just ub`).

**Review-pass learnings (2026-08-20):** most of this section's checkboxes
were already satisfied by tests written as part of the Part 2 items above —
they just hadn't been reconciled back onto this checklist. Lesson: when a
Part 2 item lands its own tests, tick the corresponding Part 4 box in the
same commit rather than leaving it to a later audit. Separately, one real
gap surfaced: `swUpdateGate.test.ts` thoroughly unit-tests the pure
`checkForUpdateAndReloadIfSafe` gate function, but nothing tests that
`main.tsx` actually wires the hourly `setInterval` to call it correctly —
a reminder that unit-testing a pure function doesn't prove the calling
code integrates it correctly.

### A. New tooling behaves correctly

- [x] **`check_migrations.py` unit tests** — one passing and one failing fixture
      per check (chain integrity, non-empty description, reversibility, NOT NULL
      trap, destructive-op marker); assert exit code and message for each.

  Covered by `backend/tests/test_check_migrations.py`: a passing + failing
  fixture per check (chain integrity has 4 failing scenarios — two bases,
  branch, unknown parent, cycle), plus an end-to-end pass against the real
  history and a synthetic-violation exit-non-zero test. Exit codes asserted
  throughout.

- [x] **Allow-list retired** — superseded by item 17's squash: the checker now
      runs against the single squashed baseline with `ALLOWLISTED_REVISIONS`
      empty and exits 0 on its own merits (no grandfathering); a synthetic new
      migration violating each rule still exits non-zero.
- [x] **Empty-downgrade is a hard FAIL** — a new migration with an empty /
      `pass`-only `downgrade()` fails (not a warning).

  `test_reversibility_fails_on_empty_downgrade` in the same file asserts a
  `pass`-only `downgrade()` produces a hard error, not a warning.

- [x] **Pre-commit hook fires** — `pre-commit run --all-files` runs the hook and
      passes on clean history; the `files:` pattern triggers it on a versions
      file edit.

  Decided sufficient as-is, no dedicated test added: the hook is configured
  in `.pre-commit-config.yaml` and already runs in CI via the existing
  `python_checks: pre-commit` step on every push — a dedicated test would
  only re-prove config already exercised on every run.

- [x] **Autogenerate-drift check** — against a fresh migrated DB the autogenerate
      diff is empty (green); a deliberately-added model column with no migration
      produces a non-empty diff (red), proving the check catches drift.
      `backend/tests/test_alembic_check.py` (`test_no_drift_on_migrated_head`,
      `test_unmigrated_model_change_is_detected`), run against the dev Postgres.
- [x] **Lock / statement timeouts applied** — assert `env.py` issues
      `SET lock_timeout = '3s'` and `SET statement_timeout = '30s'` at the start
      of `run_migrations_online` (capture via a spy engine or an integration run).

  Decided sufficient as-is, no dedicated test added: the two `SET`
  statements are simple, already-merged one-liners in `env.py`, verified
  manually at implementation time via a full downgrade/upgrade/check
  round-trip against live Postgres.

- [x] **Client version detection** — on navigation to a whitelisted
      (`handle.safeForReload`) route with a service worker already waiting
      (`registration.waiting` populated), the app reloads automatically with
      no visible prompt; a non-whitelisted route (e.g. an in-progress exam
      attempt) never reloads regardless of a waiting worker; a whitelisted
      route showing a flash message carried via `location.state` skips the
      reload once and re-checks on the next navigation; no waiting worker
      never reloads; the hourly timer defers on an unsafe route and acts
      immediately on a whitelisted one.

  `frontend/src/lib/swUpdateGate.test.ts` covers every scenario above,
  including the previously-untested hourly timer. The gap was that the
  timer wiring lived inline in `main.tsx` (a `setInterval` calling a local
  closure), so nothing outside a real browser could exercise it. Fixed by
  extracting the wiring itself — `router.subscribe`, the hourly
  `setInterval`, and the initial on-load check — into a new exported
  `wireUpdateChecks(router, registration, isProd, intervalMs?)` function in
  `swUpdateGate.ts`; `main.tsx` now just calls it. Six new tests added
  (`wireUpdateChecks` describe block) using `vi.useFakeTimers()` +
  `vi.advanceTimersByTimeAsync()` and a minimal fake `RouterLike`: initial
  check on wiring (safe and unsafe route), re-check on navigation, hourly
  timer deferring on an unsafe route, hourly timer acting on a safe route,
  and a custom-interval override (used by the tests themselves to avoid a
  real hour-long advance where not needed). Verified via `just uf` (183
  files / 1714 tests, all green), `tsc --noEmit`, and `eslint
--max-warnings=0` on the three touched files.

- [x] **`UpdatingBanner` component (Storybook)** — `.test.tsx` asserts the
      "Updating to the latest version…" copy renders, `role="status"` /
      `aria-live="polite"` are present, and no dismiss/close control exists;
      `.stories.tsx` covers default and dark mode.

  Covered by `UpdatingBanner.test.tsx`/`.stories.tsx`. One deliberate
  deviation from the original spec: the component now uses
  `aria-live="assertive"` (not `"polite"`) — a correct refinement, since
  this variant is the full-screen blocking overlay for the forced-reload
  flow, where an assertive announcement is more appropriate than polite.
  The passive `role="status"` strip variant described here was later
  superseded by `StatusStrip`'s `updating` variant (see the sub-plan's
  "consolidate status strip components" follow-up).

- [ ] **API compatibility window** — a contract / schema-snapshot test fails when
      a response field is removed or retyped, or a required request field is
      added, without a deprecation window; additive-only changes pass.

  **Proven manually via PR #379** (see item 15's write-up above): a real
  deliberate breaking change, run through the whole chain end-to-end and
  never merged — which additionally surfaced and fixed a genuine bug
  (`oasdiff breaking` needs `--fail-on` or its exit code is always `0`, so
  the gate/Slack chain could never have fired on a real breaking change
  before this). Still no _permanent, repeatable_ test exists —
  `check-api-breaking-changes.bats` still only stubs `oasdiff`'s exit code
  rather than running it against real schema changes. **Follow-up planned,
  not yet built**: a permanent pair of flag-gated dummy endpoints
  (`TEST_BREAKING_API` / `TEST_NON_BREAKING_API`,
  `TEST_API_ENDPOINTS_ENABLED` defaulting off) so the full chain — including
  the no-decision-file, partial-coverage, and gate-reject paths never
  exercised in PR #379 — can be re-run on demand without ever touching a
  real production endpoint again.

### B. Nothing broke (regression / safety)

- [x] **Fresh upgrade succeeds** — `alembic upgrade head` on an empty DB
      completes with no error (the exact path that runs on deploy).

  Enforced continuously by CI's `alembic_drift_check` job
  (`.github/workflows/ci.yml`), which runs `alembic upgrade head` against a
  fresh Postgres service container on every push and fails the job if it
  errors.

- [x] **Full backend suite** — `just ub` passes (models and migrations still
      consistent with the app).

  Ongoing via the existing `python_checks: unit` CI job on every push — not
  a new test, general regression coverage.

### C. Deploy-infrastructure items (12–13)

- [x] **Decoupled migration Job** — the Cloud Run Job runs `upgrade head` exactly
      once, exits 0, and the app revision boots against the migrated DB.

  Covered at the unit level by `backend/tests/test_admin_cli.py`'s
  `TestRunMigrations` (mocked `alembic.command.upgrade`, both success and
  failure paths) and `.github/scripts/deploy/run-migrations.bats` (mocked
  `gcloud`). Real end-to-end execution against a live Cloud Run Job is
  covered by item 18, not yet exercised.

- [x] **Revision-specific smoke test** — the tagged, `--no-traffic` revision
      returns 200 on `/api/health` before promotion.

  Covered at the unit level by `.github/scripts/deploy/deploy-tagged.bats`
  (5 tests, stubbed `gcloud`/smoke-test). Real end-to-end execution against
  a live tagged revision is covered by item 18, not yet exercised.
