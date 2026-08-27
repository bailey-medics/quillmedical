# Remove is_primary flag plan

`is_primary` is a boolean column on `organisation_staff_member` and
`organisation_patient_member` (association tables in
`backend/app/models.py:196,208`), added by an earlier LLM pass. Research
confirmed it is write-only in practice: it's set on inserts in four
places, and the one place it's "read" (`main.py:3872-3883`) only feeds
another write, not a real decision. It's exposed in one API response
(`GET /api/organisations/{org_id}`), but the frontend's TypeScript types
never included the field, so nothing consumes it for display, default-org
selection, permissions, or billing. There's also no DB constraint (no
partial unique index) enforcing "at most one primary per user" — it was
only ever approximated by non-atomic application code. Since a user
either belongs to an org or doesn't (no ordering/priority concept exists
elsewhere in the system), the flag serves no purpose. Remove it to reduce
surface area and confusion.

This ships as **two separate deploys**, mirroring the "Renaming or
retiring a column" pattern in `.claude/rules/backend.md`. Migrations run
as a pre-deploy job that completes _before_ the new revision starts, so
if the columns were dropped in the same deploy as the code change, the
**old** revision (still serving traffic during that window) would run
`SELECT ... .c.is_primary` against a table missing that column and error
on every request touching signup, org-detail, add-staff, add-patient,
and create/update-user. Phase 1-4 is deploy 1 (code only, column stays);
Phase 5 is deploy 2 (destructive migration only), started only after
deploy 1 is confirmed live in the teaching environment.

Note: production promotion is currently disabled repo-wide
(`ENABLE_PRODUCTION_DEPLOY` unset — see `deploy.yml`'s `promote-to-production`
job, offline to save GCP costs), so "live" here means the teaching
environment, which is the only environment either deploy actually
reached. The two-deploy reasoning above still applies unchanged: teaching
is the environment serving real traffic during the migration window.

## Phase 1: Backend application code (`backend/app/main.py`) — deploy 1

- [x] Remove `is_primary=True` from the signup-flow insert (~line 1017)
- [x] Remove `is_primary=(org_id == payload.organisation_ids[0])` from
      the admin create-user insert (~lines 1397-1405)
- [x] Remove `is_primary=(i == 0)` from the admin update-user insert
      (~lines 1575-1581) — discovered while implementing: this also
      required changing `for i, org_id in enumerate(payload.organisation_ids)`
      to a plain `for org_id in payload.organisation_ids`, since `i` had
      no other use once `is_primary=(i == 0)` was removed
- [x] Delete the "Auto-set as primary if user has no existing primary
      org" block entirely (~lines 3871-3884): the `has_primary` query
      and the `is_primary=has_primary is None` kwarg — the insert
      becomes a plain `organisation_id`/`user_id` insert
- [x] Remove `is_primary=False` from `add_patient_to_organisation`'s
      insert (~line 3966)
- [x] Drop `organisation_staff_member.c.is_primary` and
      `organisation_patient_member.c.is_primary` from the two `select()`
      statements in the org-detail endpoint (~lines 3500-3530)
- [x] Drop `"is_primary": sm.is_primary or False` and `"is_primary":
    pm.is_primary or False` from the response dicts (~lines 3569-3585)
- [x] Verify the docstrings at `main.py:2070` and `main.py:2084`
      (already corrected to describe the org-union behaviour earlier
      this session) stay consistent with these changes — confirmed no
      stale "primary org" text remains anywhere in `main.py`
- [x] Note: the `is_primary` columns are **not** touched in this phase —
      they stay in the schema, `nullable=False`. Since no insert passes a
      value for the column any more, SQLAlchemy applies the Core column's
      Python-side `default=False` automatically, so `NOT NULL` stays
      satisfied without any migration

## Phase 2: Backend tests — deploy 1

- [x] Delete `test_add_staff_auto_sets_primary` and
      `test_add_staff_does_not_override_primary` from
      `backend/tests/test_main_endpoints.py` (~lines 741-855) — both
      test behaviour that no longer exists
- [x] Delete `test_organisation_primary_flag` from
      `backend/tests/test_models.py` (~lines 357-395)
- [x] Remove `assert org_row.is_primary is True` from
      `backend/tests/test_validate_clinical_lead.py:255` (rest of test
      stays)
- [x] Remove the "Verify primary flag" block from
      `test_organisation_patient_relationship` in
      `backend/tests/test_models.py:344-355` (rest of test stays)
- [x] Strip the now-invalid `is_primary=...` kwarg from remaining
      fixture inserts (mechanical, value never asserted on):
      `test_main_endpoints.py` (multiple sites, e.g. 402, 837, 875, 942,
      972, 977, 1009, 1031, 1068, 1099, 1104, 1225, 1243, 1337, 1355,
      1452), `test_organisation_features.py:173,409`,
      `test_messaging.py:49,56,80,1073,1298,1347`,
      `test_teaching_router.py:64,86,244`,
      `test_clinical_services.py:132` — also fixed two now-stale
      docstrings discovered while editing (`_make_educator`/
      `_make_learner` in `test_teaching_router.py` said "linked as
      primary staff") and one stale comment ("Link user to org as
      primary" in `test_organisation_features.py`)
- [x] `just ub` — full backend unit suite passes (720 tests, all green)

## Phase 3: Frontend — deploy 1

- [x] Strip `is_primary` from the mock API fixtures in
      `frontend/src/pages/admin/organisations/OrganisationAdminPage.test.tsx:264-265,677,684`
      (field no longer exists in the real response)
- [x] No TS interface changes needed — `StaffMember`/`PatientMember` in
      `OrganisationAdminPage.tsx:42-54` never included the field
- [x] `just uf src/pages/admin/organisations/OrganisationAdminPage.test.tsx`
      — all 24 tests pass

## Phase 4: Verification and merge — deploy 1

- [x] `just ub -k "organisation or staff or patient"` — targeted rerun
      during development (passed, subset of full suite)
- [x] `just ub` — full backend unit suite (all 720 tests pass)
- [x] Push the branch and trigger CI via PR ready-for-review
- [x] **oasdiff result: zero breaking changes detected**. The `is_primary`
      field was never documented in the OpenAPI spec (the endpoint returns
      `dict[str, Any]`, not a typed Pydantic model), and no clients
      depended on it (frontend types never included it). No decision files
      needed.
- [x] Merge the PR
- [x] Confirm deploy 1 is live in the teaching environment before
      starting Phase 5 (deploy run
      [32864935627](https://github.com/bailey-medics/quillmedical/actions/runs/32864935627)
      for commit `34c85965` — `Deploy to teaching` succeeded;
      `Promote to production` was skipped, as it is for every push while
      production is offline (see note above))

## Phase 5: Model and migration — deploy 2 (separate PR, after deploy 1 is live)

- [x] Remove `Column("is_primary", Boolean, default=False,
    nullable=False)` from `organisation_staff_member`
      (`backend/app/models.py:196`) and `organisation_patient_member`
      (`backend/app/models.py:208`)
- [x] Run `just migrate "drop is_primary from organisation membership
    tables"` to generate the revision — produced
      `fa4401ce1b92_drop_is_primary_from_organisation_.py`
- [x] Add `# migration-check: allow-destructive` above both
      `drop_column` calls in the generated `upgrade()`
- [x] Write a real `downgrade()` that re-adds both columns with
      `server_default=sa.false()` (required since `nullable=False`) —
      verified locally with a downgrade/upgrade round trip against the
      dev database
- [x] Confirm the migration's docstring/slug is meaningful (required by
      `backend/scripts/check_migrations.py`)
- [x] `python backend/scripts/check_migrations.py --all` — passes
      (exit 0)
- [x] `just ub` — full backend unit suite (all 720 tests pass, no
      behavioural change — columns were already unused as of deploy 1)
- [x] Merge the PR and confirm the pre-deploy migration job succeeds and
      deploy 2 is live in the teaching environment — this is the step
      that actually drops the columns; migrations run as a separate
      Cloud Run Job before the new revision starts
      (`.claude/rules/backend.md`), so a failed migration job blocks the
      deploy rather than silently no-op-ing. Merged as PR #401
      (`94bb042a`); deploy run
      [32868151270](https://github.com/bailey-medics/quillmedical/actions/runs/32868151270)
      — `Deploy to teaching` succeeded (migration job ran as part of
      that job, per `deploy.yml`); `Promote to production` skipped, as
      expected while production is offline (see note under the plan
      title)

## Decisions

| Decision | Rationale |
| --- | --- |
| Two-deploy split: code removal first, `drop_column` migration second | Migrations run pre-deploy and complete before the new revision starts, so dropping the columns in the same deploy as the code change would break the still-serving old revision's `is_primary` queries. Mirrors the existing "Renaming or retiring a column" expand-contract pattern in `.claude/rules/backend.md`, simplified since there's no new column/backfill — just "stop referencing" then "drop" |
| API response field removed in deploy 1, not staged further | Research confirmed nothing reads `is_primary` for any decision (frontend types never even included it) — this is exactly the case the `api-breaking-change-review` human-approval gate exists for, so a further multi-release deprecation window for a dead field would be pure ceremony beyond the required reviewer sign-off |
| No decision files created | `oasdiff` reported zero breaking changes for the `is_primary` removal, so there was nothing for `validate-compat-files.sh` to require coverage for. Cause: `GET /organisations/{org_id}` is declared `-> dict[str, Any]` rather than a typed Pydantic model, so the field was never documented in the OpenAPI spec in the first place — `oasdiff` had no schema to diff against. This gap (and its wider prevalence across the API) is tracked separately in [2026-08-25-api-schema-coverage-plan.md](2026-08-25-api-schema-coverage-plan.md) |
| Delete the dedicated `is_primary` tests rather than skip/deprecate | The behaviour under test (auto-set-primary, primary-flag round-trip) is being removed outright, not deprecated — a skipped test asserting on deleted behaviour is dead weight |
| No DB constraint existed to migrate away from | Confirmed via research there's no partial unique index enforcing "one primary per user" — removal only requires dropping the columns, not untangling a constraint |
| "Live in production" in this plan actually means the teaching environment | Production promotion is disabled repo-wide (`ENABLE_PRODUCTION_DEPLOY` unset, `promote-to-production` skipped for every push) — an existing, deliberate cost-saving decision unrelated to this work, not something introduced or worked around here. Both deploy 1 and deploy 2 reached only the teaching environment, which is currently the sole live-serving environment the two-deploy expand-contract reasoning protects. When production is re-enabled, its schema will need the same migration applied (already captured by the standard `just migrate-remote production`-style pre-deploy job — no extra action needed at that point, just noting it hasn't happened yet) |
