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
deploy 1 is confirmed live in production.

## Phase 1: Backend application code (`backend/app/main.py`) — deploy 1

- [ ] Remove `is_primary=True` from the signup-flow insert (~line 1017)
- [ ] Remove `is_primary=(org_id == payload.organisation_ids[0])` from
      the admin create-user insert (~lines 1397-1405)
- [ ] Remove `is_primary=(i == 0)` from the admin update-user insert
      (~lines 1575-1581)
- [ ] Delete the "Auto-set as primary if user has no existing primary
      org" block entirely (~lines 3871-3884): the `has_primary` query
      and the `is_primary=has_primary is None` kwarg — the insert
      becomes a plain `organisation_id`/`user_id` insert
- [ ] Remove `is_primary=False` from `add_patient_to_organisation`'s
      insert (~line 3966)
- [ ] Drop `organisation_staff_member.c.is_primary` and
      `organisation_patient_member.c.is_primary` from the two `select()`
      statements in the org-detail endpoint (~lines 3500-3530)
- [ ] Drop `"is_primary": sm.is_primary or False` and `"is_primary":
    pm.is_primary or False` from the response dicts (~lines 3569-3585)
- [ ] Verify the docstrings at `main.py:2070` and `main.py:2084`
      (already corrected to describe the org-union behaviour earlier
      this session) stay consistent with these changes
- [ ] Note: the `is_primary` columns are **not** touched in this phase —
      they stay in the schema, `nullable=False`. Since no insert passes a
      value for the column any more, SQLAlchemy applies the Core column's
      Python-side `default=False` automatically, so `NOT NULL` stays
      satisfied without any migration

## Phase 2: Backend tests — deploy 1

- [ ] Delete `test_add_staff_auto_sets_primary` and
      `test_add_staff_does_not_override_primary` from
      `backend/tests/test_main_endpoints.py` (~lines 741-855) — both
      test behaviour that no longer exists
- [ ] Delete `test_organisation_primary_flag` from
      `backend/tests/test_models.py` (~lines 357-395)
- [ ] Remove `assert org_row.is_primary is True` from
      `backend/tests/test_validate_clinical_lead.py:255` (rest of test
      stays)
- [ ] Remove the "Verify primary flag" block from
      `test_organisation_patient_relationship` in
      `backend/tests/test_models.py:344-355` (rest of test stays)
- [ ] Strip the now-invalid `is_primary=...` kwarg from remaining
      fixture inserts (mechanical, value never asserted on):
      `test_main_endpoints.py` (multiple sites, e.g. 402, 837, 875, 942,
      972, 977, 1009, 1031, 1068, 1099, 1104, 1225, 1243, 1337, 1355,
      1452), `test_organisation_features.py:173,409`,
      `test_messaging.py:49,56,80,1073,1298,1347`,
      `test_teaching_router.py:64,86,244`,
      `test_clinical_services.py:132`

## Phase 3: Frontend — deploy 1

- [ ] Strip `is_primary` from the mock API fixtures in
      `frontend/src/pages/admin/organisations/OrganisationAdminPage.test.tsx:264-265,677,684`
      (field no longer exists in the real response)
- [ ] No TS interface changes needed — `StaffMember`/`PatientMember` in
      `OrganisationAdminPage.tsx:42-54` never included the field

## Phase 4: Verification, decision files, and merge — deploy 1

- [ ] `just ub -k "organisation or staff or patient"` — targeted rerun
      during development
- [ ] `just ub` — full backend unit suite
- [ ] `just uf src/pages/admin/organisations/OrganisationAdminPage.test.tsx`
      — frontend test after fixture cleanup
- [ ] Push the branch and let the `api_breaking_change_check` CI job run
      `oasdiff breaking` to get the exact flagged change string(s).
      Expect **two** separate changes — `is_primary` is removed from two
      different array-item shapes (`staff_members[]` and
      `patient_members[]`) on the same `GET /api/organisations/{org_id}`
      endpoint, and `validate-compat-files.sh` requires one decision file
      per distinct flagged change (id+operation+path+text), not one per
      endpoint
- [ ] For each flagged change, run
      `python backend/scripts/new_compat_decision.py`, paste the exact
      change string from the CI log, answer `n` to force-reload (nothing
      consumes this field — confirmed by research, frontend types never
      included it), and give a reason referencing that research. This
      writes a new `api-compatibility/YYYYMMDDHHMMSS-<slug>.yaml` file
      per change
- [ ] Commit the generated decision file(s) and push again — CI's
      coverage check (`validate-compat-files.sh` rule 2) requires every
      oasdiff-flagged change to have a matching file before the check
      passes
- [ ] Get the PR human-approved via the `api-breaking-change-review` required-
      reviewer GitHub Actions environment (repo owner is the sole
      reviewer) — this is a separate action in the GitHub UI/app, not
      satisfied by anything in the PR diff itself
- [ ] Merge and confirm deploy 1 is live in production before starting
      Phase 5

## Phase 5: Model and migration — deploy 2 (separate PR, after deploy 1 is live)

- [ ] Remove `Column("is_primary", Boolean, default=False,
    nullable=False)` from `organisation_staff_member`
      (`backend/app/models.py:196`) and `organisation_patient_member`
      (`backend/app/models.py:208`)
- [ ] Run `just migrate "drop is_primary from organisation membership
    tables"` to generate the revision
- [ ] Add `# migration-check: allow-destructive` above both
      `drop_column` calls in the generated `upgrade()`
- [ ] Write a real `downgrade()` that re-adds both columns with
      `server_default=sa.false()` (required since `nullable=False`)
- [ ] Confirm the migration's docstring/slug is meaningful (required by
      `backend/scripts/check_migrations.py`)
- [ ] `python backend/scripts/check_migrations.py --all` — confirms the
      migration passes the destructive-marker/downgrade/linear-chain
      checks
- [ ] `just ub` — full backend unit suite (no behavioural change
      expected, columns are already unused as of deploy 1)

## Decisions

| Decision                                                             | Rationale                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two-deploy split: code removal first, `drop_column` migration second | Migrations run pre-deploy and complete before the new revision starts, so dropping the columns in the same deploy as the code change would break the still-serving old revision's `is_primary` queries. Mirrors the existing "Renaming or retiring a column" expand-contract pattern in `.claude/rules/backend.md`, simplified since there's no new column/backfill — just "stop referencing" then "drop" |
| API response field removed in deploy 1, not staged further           | Research confirmed nothing reads `is_primary` for any decision (frontend types never even included it) — this is exactly the case the `api-breaking-change-review` human-approval gate exists for, so a further multi-release deprecation window for a dead field would be pure ceremony beyond the required reviewer sign-off                                                                            |
| `forces_reload: false` on both decision files                        | A stale tab that never read this field is unaffected by its disappearance from the response — no reload is needed for tabs to stay functionally correct, per `docs/docs/backend/api-compatibility.md`'s guidance that optional-field removals are a routine, silent case                                                                                                                                  |
| Delete the dedicated `is_primary` tests rather than skip/deprecate   | The behaviour under test (auto-set-primary, primary-flag round-trip) is being removed outright, not deprecated — a skipped test asserting on deleted behaviour is dead weight                                                                                                                                                                                                                             |
| No DB constraint existed to migrate away from                        | Confirmed via research there's no partial unique index enforcing "one primary per user" — removal only requires dropping the columns, not untangling a constraint                                                                                                                                                                                                                                         |
