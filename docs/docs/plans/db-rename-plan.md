# Auth database rename plan

## Goal

Rename the current auth database logical name from `quill_auth` to
`quill_core` with minimal downtime and a safe rollback path.

## Why this rename

The database now stores data and workflows broader than authentication.
`quill_core` better reflects current and future usage.

## Scope

This plan covers:

1. Terraform auth Cloud SQL module inputs and dependent env wiring
2. Backend configuration defaults and runtime env resolution
3. Docker Compose dev and CI service config and health checks
4. Deployment validation in teaching/staging before production
5. Rollback if startup checks fail

This plan does not change application table names or ORM model names.

## Proposed naming

1. Database name: `quill_core`
2. Cloud SQL instance suffix: keep as `auth` for now to reduce blast radius
3. Env variable names: keep `AUTH_DB_*` for phase 1, optionally rename later

## Risk profile

Primary risks:

1. Backend cannot connect after deploy due to mismatched DB name
2. CI/dev Compose health checks fail if they still reference `quill_auth`
3. Jobs/scripts using old defaults fail silently until exercised

Risk level:

1. Medium for infrastructure and deployment
2. High if attempted as a one-step production cutover without rehearsal

## Delivery strategy

Use a two-phase migration with rehearsal.

1. Phase A: Prepare and dual-support naming in code/config
2. Phase B: Switch active DB name to `quill_core` and verify

Within phase A, run a local preflight before teaching rollout.

## Phase A prepare

### A1 Inventory and freeze

- [x] Confirm all `quill_auth` references in backend, infra, compose, CI, docs
- [x] Freeze unrelated infra changes during rename window
- [x] Announce change window and rollback owner

Inventory notes:

1. Backend: `backend/app/config.py` default `AUTH_DB_NAME`
2. Infra: `infra/main.tf` auth module `db_name`
3. Compose: `compose.dev.yml` and `compose.ci.yml` `POSTGRES_DB` + healthchecks
4. Docs: `docs/docs/infrastructure/gcp.md` and
   `docs/docs/backend/three-database-migration.md`
5. Generated/local artefacts also contain `quill_auth` (for example
   `backend/htmlcov/*`, `backend/.hypothesis/*`) and are non-authoritative
   for rename changes.
6. Operational acknowledgement recorded to proceed without additional freeze
   ceremony for this execution.

### A2 Introduce compatibility defaults

- [x] Keep `AUTH_DB_*` variable names unchanged to reduce code churn
- [x] Update default `AUTH_DB_NAME` to `quill_core` in backend settings
- [x] Update Compose dev/CI database names and health checks to `quill_core`
- [x] Update docs and runbooks that mention `quill_auth`

### A3 Terraform updates

- [x] In `infra/main.tf`, set auth module `db_name` from `quill_auth` to
      `quill_core`
- [x] Keep module name and outputs stable (`cloud_sql_auth`) for this phase
- [ ] Generate and review Terraform plan for each environment

Blocker note:

1. `terraform plan` for teaching failed due GCP auth session expiry
   (`invalid_grant`, `invalid_rapt`) when reading remote state.
2. Re-authenticate Google Cloud CLI and rerun plan for teaching/staging/prod.

### A3.5 Local preflight (before teaching)

- [x] Start local stack with renamed auth DB and verify backend boots
- [x] Run auth smoke checks locally (login, refresh, protected endpoint)
- [x] Run non-integration backend tests in container locally
- [x] Confirm no auth DB connection errors in local logs

Local validation notes:

1. `docker compose -f compose.dev.yml up -d --build postgres-auth backend frontend caddy` succeeded and backend reached healthy startup.
2. Auth smoke checks passed locally: `/api/auth/login`, `/api/auth/refresh`, and `/api/auth/me` returned success.
3. `just ub` passed (`pytest -q -m 'not integration'`) inside container.
4. Backend logs show successful auth requests and no auth DB connection errors.

### A4 Rehearsal in teaching

- [ ] Apply Terraform in teaching only
- [ ] Deploy backend and admin job against new DB name
- [ ] Run smoke tests for login, token refresh, admin actions, migrations
- [ ] Run non-integration backend tests in container

Exit criteria for phase A:

- [ ] Teaching healthy through smoke tests and a focused verification run
- [ ] No reconnect loops, startup failures, or migration failures

## Phase B production cutover

### B1 Pre-cutover

- [ ] Confirm latest backups and restore viability
- [ ] Confirm no pending DB migrations
- [ ] Confirm rollback commands are prepared and reviewed

### B2 Execute

- [ ] Apply Terraform change for production auth DB name
- [ ] Roll backend and related jobs
- [ ] Confirm Cloud Run revisions healthy
- [ ] Run smoke test suite immediately

### B3 Post-cutover verification

- [ ] Auth flows: login, refresh, logout, protected route access
- [ ] Admin workflows that read or write core data
- [ ] Error logs and monitoring checks for DB connection issues

## Rollback plan

Rollback trigger examples:

1. Backend fails to start or repeated DB connection errors
2. Auth endpoints failing in smoke tests
3. Migration or job failures tied to database name mismatch

Rollback steps:

- [ ] Revert Terraform `db_name` for auth module to `quill_auth`
- [ ] Revert backend and compose defaults if changed in same release
- [ ] Redeploy previous known-good backend revision
- [ ] Re-run smoke tests and monitor recovery

## Implementation checklist

- [ ] `backend/app/config.py` default `AUTH_DB_NAME`
- [ ] `infra/main.tf` auth Cloud SQL module `db_name`
- [ ] `compose.dev.yml` auth `POSTGRES_DB` and healthcheck
- [ ] `compose.ci.yml` auth `POSTGRES_DB` and healthcheck
- [ ] Any scripts/docs referencing `quill_auth`

## Validation checklist

- [ ] `terraform plan` is clean and reviewed for all target environments
- [ ] Backend starts with expected `AUTH_DB_NAME=quill_core`
- [ ] Health checks green in Cloud Run
- [ ] Login and token refresh pass manually and in automated checks
- [ ] No sustained DB errors in logs during and after cutover validation window

## Follow-up optional phase

After stable cutover, consider a separate cleanup phase:

1. Rename `AUTH_DB_*` env vars to `CORE_DB_*`
2. Rename module labels if desired (`cloud_sql_auth` to `cloud_sql_core`)
3. Keep compatibility aliases temporarily to avoid cross-repo breakage
