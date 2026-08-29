# Alembic migration safety

## Overview

Database migrations run as a **separate pre-deploy step**, not inside the
serving container. `deploy.yml` executes the `quill-admin-{env}` Cloud Run
Job (`ADMIN_ACTION=run-migrations`, running `alembic upgrade head` via
`backend/scripts/admin_cli.py`) with `--wait`, **before** the new backend
revision is created. A failed migration blocks the deploy — the subsequent
`gcloud run services update` step never runs — rather than crash-looping the
serving container. This page explains the mechanics that keep that safe, and
the tooling that enforces the rules automatically rather than relying on
human review alone.

Only the **core database** is migrated by Alembic. HAPI FHIR and EHRbase
manage their own schemas and are out of scope.

## How a deploy stays safe: a pre-deploy job + expand-contract

The migration job runs to completion (or fails) before the new backend
revision is created. Cloud Run then keeps the **previous** revision serving
100% of traffic while the new revision boots — the new revision only
receives traffic once it reports healthy. Running the migration first, once,
outside any serving instance removes the multi-instance race that would
otherwise occur if every new-revision instance tried to run it on startup.

- **PostgreSQL's transactional DDL is what actually prevents a stuck
  half-migrated database.** `env.py` runs `alembic upgrade head` as a single
  transaction. If any migration in the batch fails, Postgres rolls back the
  whole batch — the database is left exactly at the pre-deploy revision, and
  the old revision keeps serving against the schema it already understands.
  There is nothing to downgrade.
- **The residual risk is a migration that succeeds but isn't
  backward-compatible** — e.g. a `RENAME` or `DROP COLUMN` still read by the
  old, still-serving revision (which is still live at the moment the
  migration job runs, since the new revision hasn't been created yet). This
  is why every migration must follow **expand-contract**: only ever _add_
  things the old app can ignore (new columns nullable or defaulted); never
  rename or drop something still in use. The destructive half (dropping the
  superseded column) ships as a **separate, later** migration, once no
  serving revision needs the old shape.
- We deliberately run a **roll-forward** posture — no automatic `downgrade`
  on deploy failure. A failed migration job simply blocks the deploy (the
  old revision keeps serving, untouched), and a downgrade that drops a
  column is destructive regardless, so there's nothing a downgrade buys us
  over fixing forward.

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

## Layer 3 — human review gate for destructive migrations

The static checker (Layer 1) and the drift check (Layer 2) are both automated.
They cannot judge whether a particular destructive operation — dropping a
column that stores clinical audit history, for example — is worth the cost.
That judgement is a human decision that must be recorded and auditable.

When a migration containing `drop_column`, `drop_table`, or `drop_constraint`
is added to a PR, the `db_destructive_migration_check` job in
`.github/workflows/gate-breaking.yml` detects it
(see [Destructive changes](../plans/2026-08-25-db-destructive-migration-review-plan.md))
and sends the PR to `waiting` on the `db-destructive-migration-review`
environment — a required-reviewer GitHub Actions environment with
`can_admins_bypass: false`, so the gate is binding rather than advisory. The
sole reviewer is accountable for approving the destructive change. The
environment approval is the **only** way the PR can proceed; the
`# migration-check: allow-destructive` marker inside the migration file itself
does not gate anything and cannot substitute for human approval.

### Detection is independent of the marker

The static `allow-destructive` marker (enforced by Layer 1's
`check_migrations.py`) is a pre-commit nudge, forcing an author to be
deliberate about writing a destructive migration. The CI detection runs
**regardless of whether the marker is present**, so the same text that
satisfies the static check cannot also satisfy the gate — proving a separate,
human decision happened outside the code itself, mirroring the API gate's
rejection of code comments as proof of a human approval.

### Slack notification

When destructive migrations are detected, a Slack notification lands in
`#teaching` (the same channel used for API breaking-change warnings) with:

- The migration's revision ID and description
- The destructive operations found (`drop_column`, `drop_table`, or
  `drop_constraint`)
- The PR link
- A link to "Review pending deployments" for the `db-destructive-migration-review`
  environment

A pull request is told **once per distinct set of destructive migrations**,
not once per push. `db_destructive_migration_gate_notify` hashes the
detected migrations and operations, then asks whether any comment on the PR
already carries that hash (`gate-notify.sh`, marker key
`db-destructive-migration-hash`). A later commit that leaves the same
migration(s) in place stays silent — a formatting fix or a rebase onto new
main shouldn't re-announce a finding nobody has acted on. Add a second
destructive migration and the hash moves, so a fresh message lands.

Each distinct change-set gets its **own** comment, added where it appeared in
the PR timeline and never edited afterwards, so the conversation reads as a
chronological record of what was found and when. Only the gate's **newest**
comment is consulted when deciding whether to announce, so moving back to a
change-set the PR held earlier counts as a change like any other and is
announced again — each comment records a transition, not a standing claim.

A return to clean is recorded too. When the last destructive migration is
removed the gate posts an all-clear comment (✅, "no longer present"), so the
timeline shows the risk arriving *and* going. Slack is not told — nobody needs
paging to say a risk went away — and a PR that never had a destructive
migration stays silent, since there is nothing to report the disappearance of.

The approval is unaffected by any of this: it is SHA-scoped and stays required
on every push. How often Slack is told is a notification concern, never a
safety control.

**One Slack message per gate**, sent when a break needs approval and only then.
All-clears and static-check failures — a missing `allow-destructive` marker,
say — show on the PR and nowhere else. The API breaking-change gate follows the
same rule, so knowing one gate tells you how the other behaves.

### Why this lives outside `ci.yml`

Detection, the PR record, the Slack message and the approval all sit in
`.github/workflows/gate-breaking.yml` rather than `ci.yml`, because `ci.yml`
cancels its runs when a newer commit arrives. That is right for expensive
tests and wrong here: two commits pushed in quick succession, one adding a
destructive migration and one reverting it, could leave no record the
migration ever existed. A job cannot opt out of its own run being cancelled,
so the gates needed a workflow whose runs are never cancelled.

`gate-breaking.yml` therefore sets no workflow-level concurrency, and every
commit's decision runs. Two jobs then set their own *job-level* concurrency,
which governs something different — whether two instances of that one job may
overlap, not whether the run is killed:

- The **approval gate** supersedes its older self, so a run of pushes never
  leaves a reviewer facing a queue of pending approvals. Only the newest
  commit's approval is ever outstanding.
- The **decision job** does the opposite, and does not use a concurrency group
  at all: a group holds one running plus one pending instance, so a third push
  would cancel the queued second and lose that commit's comment. It calls
  `wait-for-ancestor-decisions.sh` instead, which waits for every ancestor
  commit still deciding. That has no queue for GitHub to cap, so every commit
  is recorded — and because a run only posts once its ancestors have, the
  comments land in commit order without needing a lock.

See [Gate notification workflow](../plans/2026-08-29-gate-notification-workflow-plan.md)
for the alternatives considered and rejected.

## `compare_server_default` is deliberately off

`env.py` enables `compare_type=True` (autogenerate notices column type
changes) but leaves `compare_server_default` at its default (off). This is a
deliberate trade-off: at our current scale, server-default comparisons
produce recurring false positives (e.g. Postgres normalising a default
expression's text) that outweigh the benefit of auto-detecting genuine
drift, and there are few enough server defaults in play that they're managed
explicitly in migrations instead.

## `lock_timeout` and `statement_timeout` on migrations

`env.py` executes `SET lock_timeout = '3s'` and `SET statement_timeout =
'30s'` at the start of `run_migrations_online`, before the migration
transaction begins, so every migration inherits them.

Without a `lock_timeout`, a migration whose `ALTER TABLE` cannot immediately
acquire its `ACCESS EXCLUSIVE` lock (because a long-running query is already
reading/writing that table) queues indefinitely — and every subsequent
query against that table queues behind the migration in turn, stalling all
traffic to it. A short `lock_timeout` makes the migration fail fast instead;
thanks to PostgreSQL's transactional DDL, that failure rolls back cleanly
and the old app revision keeps serving against the unchanged schema (see
the crash-loop mitigation section in the [review plan](../plans/2026-08-09-alembic-review-plan.md)).
`statement_timeout` is a similar backstop against a single migration
statement running away.

## Pre-deploy migration job (not run in the serving container)

Migrations run once, as a pre-deploy step, instead of inside the serving
container on every boot:

- `backend/scripts/admin_cli.py` gained a `run-migrations` action
  (`ADMIN_ACTION=run-migrations`) that calls `alembic.command.upgrade(cfg,
"head")` against the `alembic.ini` already shipped in the `admin` Docker
  image target (`backend/Dockerfile`) — the same image/target used for the
  other one-off admin tasks (see [admin tasks](../infrastructure/admin.md)).
- `deploy.yml` builds and pushes that `admin` image alongside `backend`
  whenever backend source changes, then runs `.github/scripts/deploy/run-migrations.sh`
  — which updates the `quill-admin-{env}` Cloud Run Job to the new image and
  executes it with `--wait` — **before** the tagged, `--no-traffic` backend
  deploy step (see below) that creates the new backend revision, for both
  the teaching and production stages.
- `backend/docker/entrypoint.sh` (which previously ran `alembic upgrade
head` with retries before starting uvicorn) has been removed — the
  serving container now starts uvicorn directly. The migration job running
  to completion first is what removes the old race where every new-revision
  instance independently ran the migration on startup, and lets the failure
  mode be a blocked deploy (clear pass/fail) instead of a crash-looping
  service.

## Revision-specific smoke test

The backend deploy step (`.github/scripts/deploy/deploy-tagged.sh`) deploys
the new revision under a unique traffic tag with `--no-traffic`, smoke-tests
**that revision's own tagged URL**, and only then promotes it
(`gcloud run services update-traffic --to-latest`) to receive live traffic.
Live traffic stays on the previous, still-healthy revision for the whole
window between the migration job finishing and the new revision proving
itself — including the migration's own correctness, since a broken migration
that still lets the app boot would otherwise only surface once real traffic
hit it. This complements, rather than replaces, the public-edge smoke test
that runs afterwards (`https://teaching.quill-medical.com/api/health`) —
that one continues to confirm the live edge (DNS/load balancer/Caddy) is
routing correctly post-promotion, a different failure domain from the
revision's own health.

## Related

- [Database destructive migration review plan](../plans/2026-08-25-db-destructive-migration-review-plan.md) —
  the full implementation plan, decision log, and verification steps for the
  human review gate documented in Layer 3 above.
- [Alembic review and migration safety plan](../plans/2026-08-09-alembic-review-plan.md) —
  the full review, decision log, and implementation tracker this page
  summarises.
- [Alembic migrations squash plan](../plans/2026-08-11-migrations-squash-plan.md) —
  the pre-launch history squash referenced above.
- `.github/instructions/backend.instructions.md` — the enforceable rules an
  AI coding agent (or human) sees automatically when touching `backend/**`.
