# API schema coverage plan

While investigating whether `is_primary` was safe to remove
([2026-08-25-remove-is-primary-flag-plan.md](2026-08-25-remove-is-primary-flag-plan.md)),
`oasdiff` reported **zero breaking changes** for a response field that was
in fact removed. The cause: `GET /organisations/{org_id}` is declared
`-> dict[str, Any]` in `backend/app/main.py`, so FastAPI's generated
OpenAPI spec for that response is a bare `{"type": "object"}` with no
`properties` — there is nothing for `oasdiff` to diff. `mypy --strict`
does not catch this: `dict[str, Any]` is a fully explicit, valid
annotation from mypy's point of view. The gap is specifically
_Pydantic-typedness_, a narrower property mypy doesn't check.

A follow-up survey (Explore agent, full route inventory across
`backend/app/main.py`, `push.py`, `push_send.py`, and
`features/teaching/router.py`) found this is not an isolated mistake: **73
of 113 real routes (65%)** return an untyped shape (`dict[...]`, `Any`,
`FileResponse`, or similar) with no `response_model=` set, making their
response shape invisible to the `api_breaking_change_check` CI job for
any future change. The gap is concentrated in `main.py` (67 of 82 routes,
~82%), while the messaging/conversations and teaching-router features
show it is fixable — nearly all of their routes already use
`response_model=`.

This plan has two parts: (1) build a static check that measures exactly
what `oasdiff` can see, so no _new_ opaque route ships silently, and (2)
retrofit the 73 existing opaque routes to typed Pydantic response models,
phased by feature area so each phase stays reviewable.

## Phase 1: API schema coverage check script

- [x] Add `backend/scripts/check_api_schema_coverage.py`, mirroring the
      structure of `backend/scripts/check_migrations.py` (pure-stdlib
      where possible; this one needs to import the FastAPI app to get the
      OpenAPI spec, same as `backend/scripts/dump_openapi.py` already
      does)
- [x] The script generates the OpenAPI spec (reuse
      `dump_openapi.py`'s generation logic rather than duplicating it —
      import and call it, or extract a shared helper if needed) and walks
      every path+method's response schema for the success status code
- [x] Flag any response schema `oasdiff` cannot meaningfully diff by
      field. A single literal-shape match (`{"type": "object"}` with no
      `properties`) is not enough — it misses `dict[str, X]` for a
      concrete `X` (renders as `additionalProperties`, still arbitrary
      keys, still opaque per-field), a bare top-level array of untyped
      objects (`-> list[dict[str, Any]]`, top-level `type` is `"array"`
      not `"object"`), and `Optional`/union-wrapped opaque returns
      (`-> dict[str, Any] | None` renders as `anyOf` with no top-level
      `type` at all). Define the check as a function applied recursively,
      resolving `$ref` as the _first step inside every call_ — not once
      up front — since `$ref` can reappear at any depth (an array's
      `items` can itself be a `$ref`, e.g. `list[SomeModel]`; a branch of
      `anyOf`/`oneOf` can be a `$ref`, e.g. `SomeModel | None`). After
      resolving whatever schema is passed in:
  - Object schema: flag if it has no `properties` key, regardless of
    whether `additionalProperties` is present — arbitrary keys mean no
    named field for `oasdiff` to diff either way
  - Array schema: recurse into `items` (which may itself need resolving)
  - `anyOf`/`oneOf`: flag if any non-null branch is opaque by the above
    (one untyped branch still leaves that field's shape impossible to
    diff) — recurse into each branch (each may itself need resolving)
  - No schema, or an empty schema (`{}`): flag — unconstrained/`Any`

- [x] Use an **inline marker comment**, not a central allowlist constant
      — mirroring `DESTRUCTIVE_MARKER` in `check_migrations.py`
      (`# migration-check: allow-destructive`, checked by scanning each
      file's source), not the (since-removed) `ALLOWLISTED_REVISIONS`
      central-list pattern. `ALLOWLISTED_REVISIONS` fit immutable
      historical revision IDs that never move once created; a route's
      `(method, path)` is living code that can be renamed or refactored
      with nothing keeping a central list in sync.
      An inline marker travels with the function, disappears
      automatically when the route is deleted, and gets removed in the
      same diff as the fix during Phases 3-7 — no second file to
      remember to update. Two marker strings, checked the same way
      `DESTRUCTIVE_MARKER` is (substring search over each route file's
      source, or an AST walk that checks for a comment on the line(s)
      immediately above each `@router.<method>(...)` decorator):
  - `# api-schema-check: allow-opaque-grandfathered` — placed above each
    of the 73 currently-opaque routes in Phase 2, removed as each is
    retyped in Phases 3-7. Phase 8 confirms zero of these remain, then
    deletes recognition of this marker from the checker entirely — it
    is not usable again after that work is done
  - `# api-schema-check: allow-opaque-permanent` — placed above the 3
    binary `FileResponse` image-serving routes (`_serve_teaching_image`,
    `_serve_cover_image`, `_serve_learning_image`), as a bare marker line
    with no appended reason text — the checker only matches the marker
    string itself (via a return-type check, not the comment text), so a
    per-route reason would just look editable/customisable without doing
    anything. Not expected to ever reach zero, and that's fine — Phase 8
    only checks the grandfathered marker count, not this one

- [x] Don't just trust `allow-opaque-permanent` as a blanket comment —
      verify it. Route deletion is self-cleaning (the marker goes with
      the function) and a bare rename is harmless (the marker is
      physically attached to the code, so it travels with a renamed
      function), but neither of those is the real risk. The real risk is
      someone changing what the route _returns_ — e.g. converting
      `_serve_teaching_image` from `FileResponse` to a JSON-shaped
      response — while the marker comment sits there unchanged, since a
      permanent marker (unlike the grandfathered one) is never
      independently revisited. For any route bearing
      `allow-opaque-permanent`, the checker must confirm the function's
      return annotation is actually one of a small explicit set of
      non-JSON Starlette/FastAPI response classes (`FileResponse`,
      `StreamingResponse`, `PlainTextResponse`, `RedirectResponse`, or a
      raw `Response` used for non-JSON content) — if the marker is
      present but the return type doesn't match, that's a check failure
      ("permanent marker present but route no longer returns a
      recognised non-JSON response type"), not a silent pass
- [x] `--all` CLI flag matching `check_migrations.py`'s convention, exit
      non-zero listing every offending route (method + path + file:line)
      that has neither marker
- [x] Regression tests in `backend/tests/test_api_schema_coverage.py`
      (mirroring `backend/tests/test_alembic_check.py`'s structure) —
      cover: a typed route passes, an opaque route with no marker fails,
      an opaque route with the grandfathered marker passes (until plan
      complete, and then the marker becomes obsolete). For the permanent
      marker, test each recognised class individually, not just
      `FileResponse` — a route with the permanent marker passes for each
      of `FileResponse`, `StreamingResponse`, `PlainTextResponse`,
      `RedirectResponse`, and a raw `Response` used for non-JSON content
      (five separate cases; a bug that only recognises `FileResponse`
      and silently mishandles the other four would pass a test suite
      that only exercises `FileResponse`). Also cover the negative case:
      a route with the permanent marker whose return type is _not_ one
      of those five fails (proves the marker is verified, not just
      trusted)
- [x] `just ub -k test_api_schema_coverage` — new tests pass

## Phase 2: Grandfather existing gaps and wire into CI

- [x] Add `# api-schema-check: allow-opaque-grandfathered` above each of
      the 70 currently-opaque, to-be-retrofitted routes (the Phase 3-7
      lists below total 70, not 73 — the "73" in the intro/survey also
      counts the 3 permanently-opaque `FileResponse` image routes, which
      get the distinct permanent marker instead, applied to
      `backend/app/main.py`'s `_serve_teaching_image`,
      `_serve_cover_image`, `_serve_learning_image` in this same phase
      since Phase 1 already designed that marker for exactly these 3
      routes and there is no later phase that would otherwise apply it).
      Verified via `python3 backend/scripts/check_api_schema_coverage.py
--all --dev`, run both with and without `TEACHING_QUESTION_BANK_PATH`
      set (the 3 image routes only register when that env var is set and
      `TEACHING_GCS_BUCKET` is not) — clean (exit 0) in both cases
- [x] Add a `check-api-schema-coverage` hook to `.pre-commit-config.yaml`,
      following the `check-migrations` hook's shape (`language: system`,
      scoped to `files: ^backend/app/.*\.py$` so it only reruns when route
      files change) — **with one necessary deviation from the shape**:
      the entry needs `--dev` appended (`entry: python3
backend/scripts/check_api_schema_coverage.py --all --dev`).
      `check_migrations.py` is pure-stdlib and never imports the app, so
      it needed no such flag; this new script must import the real
      FastAPI app (`import_app`, shared with `dump_openapi.py`) to read
      the live OpenAPI spec, which fails with a `pydantic` validation
      error for missing `JWT_SECRET`/`CORE_DB_PASSWORD`/etc. under the
      repo-root `.env` alone — confirmed by literally running the
      no-`--dev` entry from the repo root and reproducing the crash.
      `--dev` supplies the same fallback secrets `dump_openapi.py --dev`
      already uses in CI (`ci.yml`'s `api_breaking_change_check` and
      `docs.yml`), so this keeps the new hook consistent with the
      existing precedent rather than introducing a new one
- [x] **Second CI-only gap found after pushing**: the `pre-commit` matrix
      task in `ci.yml` deliberately runs in a bare venv containing only
      `pre-commit` itself (`ensure-pre-commit-venv.sh`) —
      `install-backend-deps: ${{ matrix.task == 'unit' }}` skips
      installing the backend's Poetry-managed dependencies for that job,
      since `check_migrations.py` never needed them. This new hook
      imports the real FastAPI app, which needs the full dependency set
      (`httpx`, `sqlalchemy`, etc.) — confirmed by a CI failure:
      `ModuleNotFoundError: No module named 'httpx'`. `--dev` (a secrets
      fallback) cannot fix a missing-package error. Locally this was
      masked because `python3` on the developer's PATH already resolved
      into backend's Poetry venv. Fixed with two changes: (1) `ci.yml`'s
      `install-backend-deps` condition now also covers
      `matrix.task == 'pre-commit'`, so that job's Poetry venv actually
      gets built; (2) the hook's `entry` changed from bare `python3
backend/scripts/check_api_schema_coverage.py --all --dev` to
      `poetry -C backend run python3
scripts/check_api_schema_coverage.py --all --dev` — `poetry run`
      resolves backend's venv explicitly regardless of what happens to
      be active on `PATH`, so local and CI behaviour no longer depend on
      an accident of the invoking shell. Verified locally via `pre-commit
run check-api-schema-coverage --all-files`
- [x] **Third CI-only gap, found because the second fix's own CI run still
      failed with the identical `ModuleNotFoundError: No module named
'httpx'`** — traced with `gh run view --log-failed`, which showed
      `poetry install` genuinely succeeded and wrote `httpx` into
      `backend/.venv` in the `pre-commit` job, yet the hook's `sys.path`
      still pointed at the _other_, backend-deps-free `.venv` created by
      `ensure-pre-commit-venv.sh` at the repo root (the one the "Run
      pre-commit" step activates via `. .venv/bin/activate` before
      invoking any hooks). Root cause: with that unrelated venv already
      active, `poetry -C backend run` deferred to the **active**
      `VIRTUAL_ENV` instead of resolving backend's own project venv —
      confirmed with an isolated reproduction (a throwaway Poetry project, `env
-i` to strip all ambient state, a foreign venv activated): without
      a fix, `poetry -C <project> run python3 -c "import httpx"` fails
      with the foreign venv's interpreter; prefixing the same command
      with `env -u VIRTUAL_ENV` makes it correctly resolve the project's
      own venv and succeed. (Testing directly against the real local
      `backend` project didn't discriminate — it already has a
      _pre-existing_ Poetry-registered venv from before `in-project` mode
      was adopted, which Poetry finds via its on-disk registry regardless
      of any foreign active venv; the throwaway project, with no such
      registry, faithfully matches a fresh CI runner.) Fixed by changing
      the hook's `entry` to `env -u VIRTUAL_ENV poetry -C backend run
python3 scripts/check_api_schema_coverage.py --all --dev`, so
      Poetry's project-venv resolution no longer depends on whatever
      happens to already be active on `PATH`/`VIRTUAL_ENV` at hook-run
      time — deterministic in both CI and any developer's shell,
      regardless of their own local Poetry/venv setup. Verified locally
      via `pre-commit run check-api-schema-coverage --all-files` and via
      the isolated reproduction above
- [x] Confirm the hook runs clean on the current branch (0 unexpected
      opaque routes beyond the allowlist) — `python3
backend/scripts/check_api_schema_coverage.py --all --dev` exits 0
      with no errors
- [x] `just ub` — full backend suite still green (no behavioural change
      yet, this phase is tooling + grandfathering only). Note: this must
      be run against a container started via `just start-teaching`
      (`CLINICAL_SERVICES_ENABLED=false`), matching the CI `unit` job's
      env — a `just start-dev` container (clinical services enabled)
      fails `test_register_success` regardless of this plan's changes,
      since `/auth/register` is teaching-only and 403s when clinical
      services are enabled (confirmed pre-existing via `git stash`)

## Phase 3: Retrofit — auth & health (16 routes)

Define a Pydantic response model per route (or reuse one across routes
with an identical shape — several `dict[str, str]` "detail" responses may
collapse into a single shared model) and set both the function's return
type annotation and, where the return value isn't already an instance of
that model, `response_model=` on the decorator. Delete the
`# api-schema-check: allow-opaque-grandfathered` marker above each route
as it's fixed.

- [x] `health_check` — GET `/health`
- [x] `login` — POST `/auth/login`
- [x] `list_organisations_public` — GET `/auth/organisations`
- [x] `register` — POST `/auth/register`
- [x] `verify_email` — POST `/auth/verify-email`
- [x] `resend_verification` — POST `/auth/resend-verification`
- [x] `forgot_password` — POST `/auth/forgot-password`
- [x] `reset_password` — POST `/auth/reset-password`
- [x] `totp_verify` — POST `/auth/totp/verify`
- [x] `totp_disable` — POST `/auth/totp/disable`
- [x] `change_password` — POST `/auth/change-password`
- [x] `logout` — POST `/auth/logout`
- [x] `me` — GET `/auth/me`
- [x] `update_profile` — PATCH `/auth/profile`
- [x] `refresh` — POST `/auth/refresh`
- [x] `list_teaching_modules_public` — GET `/teaching/public/modules`
- [x] `just ub -k "auth or health or teaching_public"` — targeted rerun
- [x] `just ub` — full backend suite

**Phase 3 summary** — Commit `0ac013a4`. Added 7 response models to `backend/app/schemas/auth.py`:

- `DetailResponse` (simple `{"detail": str}` responses, used by 11 routes)
- `LoginOut` (login response with user object)
- `RefreshOut` (token refresh response)
- `MeOut` (current user profile with roles, permissions, features, competencies)
- `HealthCheckOut` (health check with service availability)
- `OrganisationsOut` & `OrganisationListItem` (public organisations list)
- `TeachingModulesOut` & `TeachingModuleItem` (public teaching modules list)

All 16 routes now have explicit `response_model=` set and typed return annotations.
Grandfathered markers removed. Schema coverage check passes.

## Phase 4: Retrofit — users & admin (9 routes)

- [x] `validate_clinical_lead` — POST
      `/teaching/public/validate-clinical-lead`
- [x] `create_user_with_cbac` — POST `/users`
- [x] `update_user` — PATCH `/users/{user_id}`
- [x] `deactivate_user` — POST `/users/{user_id}/deactivate`
- [x] `reactivate_user` — POST `/users/{user_id}/reactivate`
- [x] `send_invite_email` — POST `/users/{user_id}/send-invite`
- [x] `list_users` — GET `/users`
- [x] `get_user` — GET `/users/{user_id}`
- [x] `link_patient_to_user` — PATCH `/users/{user_id}/link-patient`
      (also takes a raw `dict[str, str]` request body — type the request
      too, not just the response)
- [x] `just ub -k "user"` — targeted rerun
- [x] `just ub` — full backend suite

**Phase 4 summary** — Commit `ca25d6af`. Added 8 response models and 1 request model to
`backend/app/schemas/auth.py`: ValidateClinicalLeadOut, UserActionOut, UserIdActionOut,
UserSummaryItem, UsersListOut, UserOut, LinkPatientIn, LinkPatientOut. All 9 routes
now have explicit response_model set and typed return annotations. Request body for
link_patient_to_user is also typed (LinkPatientIn). Grandfathered markers removed.
Schema coverage check passes.

## Phase 5: Retrofit — patients / FHIR / EHRbase (18 routes)

- [x] `create_patient_record` — POST `/patients/verify`
- [x] `list_patients` — GET `/patients`
- [x] `upsert_demographics` — PUT `/patients/{patient_id}/demographics`
      (also takes a raw `dict[str, Any]` request body — type the request
      too; check whether this genuinely needs to stay dynamic given FHIR
      payload variability, and if so document why in this plan's
      Decisions table rather than silently leaving it opaque)
- [x] `get_demographics` — GET `/patients/{patient_id}/demographics`
- [x] `write_letter` — POST `/patients/{patient_id}/letters`
- [x] `read_letter` — GET `/patients/{patient_id}/letters/{composition_uid}`
- [x] `list_letters` — GET `/patients/{patient_id}/letters`
- [x] `create_patient_in_fhir` — POST `/patients`
- [x] `get_patient` — GET `/patients/{patient_id}`
- [x] `update_patient` — PATCH `/patients/{patient_id}`
- [x] `get_patient_metadata` — GET `/patients/{patient_id}/metadata`
- [x] `deactivate_patient` — POST `/patients/{patient_id}/deactivate`
- [x] `activate_patient` — POST `/patients/{patient_id}/activate`
- [x] `shared_organisations_endpoint` — GET
      `/patients/{patient_id}/shared-organisations`
- [x] `invite_external_user` — POST `/patients/{patient_id}/invite-external`
- [x] `accept_invite` — POST `/accept-invite`
- [x] `revoke_external_access` — DELETE
      `/patients/{patient_id}/external-access/{user_id}`
- [x] `list_external_access` — GET
      `/patients/{patient_id}/external-access`
- [x] `just ub -k "patient or fhir or ehrbase or letter"` — targeted
      rerun
- [x] `just ub` — full backend suite

**Phase 5 summary** — New `backend/app/schemas/patients.py` adds 24
models. Two categories of finding, both recorded in the Decisions table
below:

- Three routes (`get_patient`, `create_patient_in_fhir`,
  `update_patient`) return the raw FHIR `Patient` resource directly as
  the entire response body, with no envelope — wrapping them would be a
  breaking API change, so they needed a real typed
  `FhirPatientResource` model (with `extra="allow"` for forward
  compatibility) rather than an envelope trick. The other FHIR/EHRbase
  passthrough routes already had an envelope (`{"data": ...}`,
  `{"patients": [...]}`, etc.); since the coverage checker only
  inspects a response's top-level schema (doesn't recurse into object
  properties — see `is_opaque_schema` in
  `check_api_schema_coverage.py`), typing the envelope alone was
  sufficient there and inner content (`data`, `letters`) was left as
  `dict[str, Any]` / `list[dict[str, Any]]` by design.
- `upsert_demographics`'s request body turned out not to need to stay
  dynamic (`DemographicsIn`, `extra="forbid"`) — contrary to its
  docstring, the actual consumer (`update_fhir_patient`) only reads six
  fixed keys, not an arbitrary FHIR fragment. Fixing this surfaced a
  behaviour change: a previously-accepted-but-ignored field
  (`{"name": ...}`, as sent by the existing
  `test_update_patient_demographics` test) is now rejected with 422.
  Updated that test's payload to real field names and added
  `test_update_patient_demographics_rejects_unknown_field` as a
  regression test for the new, correct behaviour.

Two pre-existing issues surfaced but deliberately not fixed in this
phase, since both are out of scope for API schema typedness and neither
was introduced by this phase's diff:

- `update_patient` (main.py) builds an `updates` dict using FHIR-shaped
  keys (`name`, `birthDate`, `gender`, `identifier`) that don't match
  any key `update_fhir_patient` actually reads (`given_name`,
  `family_name`, `date_of_birth`, `sex`, `address`, `contact`) — so most
  fields silently fail to update via this route. Left as-is pending a
  separate fix decision.
- `health_check`'s `HealthCheckOut(services=services)` call
  (`main.py:550`, from Phase 3) fails `mypy --strict` — `services` is
  built as `dict[str, dict[str, bool | int | str]]`, incompatible with
  `HealthCheckOut.services`'s declared
  `dict[str, ServiceHealthStatus | dict[str, bool | str | None]]`.
  Predates this phase; flagged for a separate fix.

## Phase 6: Retrofit — organisations & sites (21 routes)

**Chunking strategy:** Phase 6 is divided into 5 logical chunks based on feature domains:

1. **Organisations CRUD** (5 routes) — core create/read/update/delete operations
2. **Staff/patient membership** (5 routes) — organisation membership management
3. **Organisation features** (1 route) — feature toggle, treated separately due to simple scope
4. **Sites CRUD** (6 routes) — core site operations, separate from linking
5. **Site linking & staff** (4 routes) — site-to-org relationships and site staff assignment

Rationale: Breaking Phase 6 by entity (organisations, then sites) and then by operation type (CRUD, membership, linking) allows human review after each coherent feature area is complete. Each chunk produces working, testable code that doesn't block the next chunk.

### Chunk 1: Organisations CRUD (5 routes) — ✅ COMPLETE

- [x] `list_organisations` — GET `/organisations`
- [x] `get_organisation` — GET `/organisations/{org_id}` (the originally-reported route)
- [x] `update_organisation` — PUT `/organisations/{org_id}`
- [x] `create_organisation` — POST `/organisations`
- [x] `delete_organisation` — DELETE `/organisations/{org_id}`

**Status:** Commit `e81eba64`. All 5 routes retrofitted with response models. Tests passing (70+ org tests).

### Chunk 2: Staff/patient membership (5 routes) — ✅ COMPLETE

- [x] `add_staff_to_organisation` — POST `/organisations/{org_id}/staff`
- [x] `add_patient_to_organisation` — POST `/organisations/{org_id}/patients`
- [x] `remove_staff_from_organisation` — DELETE `/organisations/{org_id}/staff/{user_id}`
- [x] `remove_patient_from_organisation` — DELETE `/organisations/{org_id}/patients/{patient_id}`
- [x] `list_org_features` — GET `/organisations/{org_id}/features`

**Status:** Commit `e81eba64`. All 5 routes retrofitted with response models (OrgStaffAddResponse, OrgPatientAddResponse, StatusResponse, FeaturesListOut). Tests passing.

**Findings & decisions made during Chunks 1-2:**

- Used plain dict returns (not model instances) for response_model parameter; Pydantic validates/serializes dicts, not instances
- Fixed FeatureItem.enabled_by type: int (user ID) not string, matching database storage
- Pre-existing bugs fixed: update_patient now uses correct snake_case keys; health_check type annotation expanded to accept int
- Response type annotations use dict[str, Any] to match actual returns, satisfying mypy --strict
- Created comprehensive models in organisations.py that form the foundation for remaining 14 routes

### Chunk 3: Organisation features (1 route) — ✅ COMPLETE

- [x] `toggle_org_feature` — PUT `/organisations/{org_id}/features/{feature_key}`

**Status:** Commit `a5b30104`. Route retrofitted with response_model=FeatureToggleResponse. Tests passing.

### Chunk 4: Sites CRUD (6 routes) — ✅ COMPLETE

- [x] `list_sites` — GET `/sites`
- [x] `create_site` — POST `/sites`
- [x] `get_site` — GET `/sites/{site_id}`
- [x] `update_site` — PUT `/sites/{site_id}`
- [x] `toggle_site_active` — PATCH `/sites/{site_id}/active` (also takes a Pydantic request body — now typed as ToggleSiteActiveIn)
- [x] `delete_site` — DELETE `/sites/{site_id}`

**Status:** Commit pending. All 6 routes retrofitted with response models (SitesListOut, SiteOut, SiteDetailOut, StatusResponse). Changed toggle_site_active from dict[str, bool] to ToggleSiteActiveIn. Tests passing (10+ site tests).

### Chunk 5: Site linking & staff (4 routes) — ✅ COMPLETE

(Corrected from "(6 routes)" in this section's original heading — the
chunking-strategy overview above and the 4 items below always listed 4;
the heading count was a typo.)

- [x] `link_site_to_org` — POST `/organisations/{org_id}/sites/{site_id}`
- [x] `unlink_site_from_org` — DELETE `/organisations/{org_id}/sites/{site_id}`
- [x] `add_site_staff` — POST `/sites/{site_id}/staff` (also takes a raw `dict[str, Any]` request body — type the request too)
- [x] `remove_site_staff` — DELETE `/sites/{site_id}/staff/{user_id}`

**Status:** Commit pending. All 4 routes retrofitted with response models
(`StatusResponse` for link/unlink/remove, `AddSiteStaffResponse` for
add-staff — both already existed unused in `schemas/organisations.py`
from Chunk 4). `add_site_staff`'s request body retyped from
`dict[str, Any]` to the already-defined `AddSiteStaffIn`
(`extra="forbid"`); the manual `not user_id or not role` presence check
was removed as redundant with Pydantic's required-field validation, the
role-membership check (`clinical_lead`/`staff`/`trainee`) stays since
`AddSiteStaffIn.role` is a plain `str`. Added regression tests: request
validation for `add_site_staff` (missing `user_id`, missing `role`,
invalid role value, unknown field rejected under `extra="forbid"`) in
`test_site_staff.py`, plus a new `test_site_org_linking.py` covering
`link_site_to_org` (success, idempotent re-link, org/site not found),
`unlink_site_from_org` (success, not-found), and `remove_site_staff`
(success, not-found) — none of these three routes had any prior test
coverage. Three oasdiff `new-required-request-property` findings
(`is_active` on `PATCH /sites/{id}/active` from Chunk 4, `user_id` and
`role` on `POST /sites/{id}/staff` from this chunk) each got a decision
file under `api-compatibility/` — all three fields were already
runtime-required (manual `dict` presence/membership checks) before
typing, so `forces_reload: false` in each case; verified against a real
`oasdiff breaking` run (installed locally via `brew install oasdiff`,
diffed against a `main` worktree's spec) rather than guessed wording.

### Phase 6 completion checklist

- [x] Chunks 3-5 routes retrofitted and tested
- [x] `just ub -k "organisation or site"` — targeted rerun
- [x] `just ub` — full backend suite

## Phase 7: Retrofit — remaining outliers (6 routes)

Routes that slipped through in otherwise well-typed feature areas, plus
the two smaller route files.

(Corrected from "(11 routes)" in this section's original heading — the
6 items below match the 6 remaining `allow-opaque-grandfathered` markers
in the codebase, and 16+9+18+21+6 = 70, the plan's own stated total for
Phases 3-7. The heading count was a typo, same class of error as
Chunk 5's.)

- [x] `prescribe_controlled` — POST `/prescriptions/controlled`
      (`backend/app/main.py`) — sibling CBAC routes already use
      `response_model=UserCompetenciesResponse`; follow that pattern
- [x] `mark_read_endpoint` — POST
      `/conversations/{conversation_id}/read` (`backend/app/main.py`) —
      sole opaque route among 9 fully `response_model`-typed messaging
      siblings
- [x] `ci_teaching_sync` — POST `/ci/teaching/sync` (`backend/app/main.py`)
- [x] `subscribe` — POST `/api/push/subscribe` (`backend/app/push.py`)
- [x] `send_test` — POST `/api/push/send-test`
      (`backend/app/push_send.py`)
- [x] `download_certificate` — GET
      `/api/teaching/assessments/{assessment_id}/certificate`
      (`backend/app/features/teaching/router.py`) — returns a raw PDF
      `Response`; likely belongs in the permanent
      `PERMANENTLY_OPAQUE_ROUTES` allowlist alongside the image-serving
      routes rather than being retrofitted, since there's no JSON shape
      to type — decide during this phase and record the outcome in the
      Decisions table
- [x] `just ub -k "prescription or conversation or push or certificate"`
      — targeted rerun
- [x] `just ub` — full backend suite

**Phase 7 summary** — Retrofit 5 routes with typed Pydantic response
models, plus 1 (`download_certificate`) reclassified to the permanent
marker:

- `prescribe_controlled` → `PrescriptionResponse` (new, in
  `schemas/cbac.py`, alongside the existing `PrescriptionRequest`)
- `mark_read_endpoint` → `MarkReadOut` (new, in `schemas/messaging.py`)
- `ci_teaching_sync` → `CiTeachingSyncOut` / `CiSyncBankResult` /
  `CiSyncErrorItem` (new, in `features/teaching/schemas.py` — this route
  lives in `main.py` but is teaching-domain, so its models joined the
  teaching feature's existing schema module rather than starting a new
  one)
- `subscribe` → `SubscribeOut` (new, colocated in `push.py` alongside
  its sibling request models — that file defines its Pydantic models
  inline rather than in `schemas/`, so this follows the file's own
  existing convention rather than the repo-wide one)
- `send_test` → `SendTestOut` (new, colocated in `push_send.py`, same
  reasoning as `subscribe`)
- `download_certificate` → marker changed from
  `allow-opaque-grandfathered` to `allow-opaque-permanent`, per the
  plan's own prediction: it returns a raw PDF `Response` with no JSON
  shape to type. Return annotation changed from `-> Any` to `-> Response`
  (moved the previously function-local `from fastapi.responses import
  Response` to a module-level import) so the checker's permanent-marker
  return-type verification actually matches against something —
  `allow-opaque-permanent` requires the annotation be one of a fixed
  set of non-JSON response classes, and `Any` isn't one of them.

Also fixed a heading-count typo (same class as Chunk 5's): the section
said "(11 routes)" but always listed 6, and 16+9+18+21+6 = 70 confirms 6
is correct.

Test coverage findings: 3 of these 6 routes (`prescribe_controlled`,
`ci_teaching_sync`, `download_certificate`) had **zero** prior test
coverage. Added `test_prescribe_controlled.py` (auth-required, 403
without competency, 201 success with competency),
`test_ci_teaching_sync.py` (token not configured → 503, missing/invalid
bearer → 401, no-banks-found response shape), and a
`TestDownloadCertificate` class in `test_teaching_router.py`
(auth-required, nonexistent assessment → 404, incomplete assessment →
400) — cheap route-level tests that don't require the full PDF/GCS
fixture machinery already covered at the unit level in
`test_teaching_certificate.py`. `mark_read_endpoint`, `subscribe`, and
`send_test` already had solid coverage; no new tests needed there.
`mypy --strict` on all touched files shows the same 21 pre-existing
errors as before this phase (verified via `git stash`) — zero new
errors introduced. Re-ran `oasdiff breaking` against `origin/main` after
this phase (via the same local-`oasdiff` + `main`-worktree approach as
Chunk 5) and confirmed zero new breaking-change findings — the 3 findings
still present are the already-decided Chunk 5 ones, not yet merged to
`main`.

## Phase 8: Final verification

- [ ] Zero `# api-schema-check: allow-opaque-grandfathered` markers
      remain anywhere in `backend/app/` (only
      `# api-schema-check: allow-opaque-permanent` markers remain, on
      the binary `FileResponse` routes and any routes Phase 7 decided
      belong there)
- [ ] Delete `allow-opaque-grandfathered` recognition from
      `check_api_schema_coverage.py` entirely — not just leave the
      marker unused. This applies the same lesson that led to actually
      removing `check_migrations.py`'s `ALLOWLISTED_REVISIONS` outright
      (`feature/remove-allowlisted-revisions`): an always-empty frozenset
      with a "do NOT add new revisions here"
      comment was still live code that would honour a new entry if
      someone added one, relying on the comment as the only thing
      stopping it. A route's grandfathered marker is a one-line comment
      above a decorator — a much lower-friction bypass than adding a
      whole migration revision — so leave nothing in the checker that
      would recognise the string as valid again. Only
      `allow-opaque-permanent` recognition remains
- [ ] Update the Phase 1 regression test that asserted "an opaque route
      with the grandfathered marker passes" — flip it to assert that a
      route bearing that (now-unrecognised) comment still fails the
      check, proving the escape hatch is actually closed rather than
      just unused
- [ ] `python backend/scripts/check_api_schema_coverage.py --all` passes
      with zero unexpected findings
- [ ] `just ub` — full backend unit suite (including the flipped
      regression test)
- [ ] Push and confirm the `pre-commit` CI job runs the new hook cleanly
- [ ] Manually verify `oasdiff` now has real schema to diff: temporarily
      remove a field from one retyped response locally, confirm
      `oasdiff breaking` (per `backend/scripts/dump_openapi.py`) flags it,
      then revert — proves the fix actually closes the detection gap
      that started this plan

## Decisions

- **OpenAPI-spec-based check, not an AST heuristic on return-type
  annotations** — Measures exactly what `oasdiff` can see — the real
  downstream artifact — rather than approximating it. An AST check on
  annotations would need to special-case every way FastAPI can end up
  with a typed schema (`response_model=`, a Pydantic return type,
  `response_model` inherited from a router-level default), which the
  spec-walk sidesteps entirely
- **Grandfather all 73 existing routes with an inline marker comment,
  not a central allowlist constant** — `check_migrations.py` used to
  offer two precedents, for two different situations:
  `ALLOWLISTED_REVISIONS` (a central list) fit immutable historical
  revision IDs that never move once created; `DESTRUCTIVE_MARKER` (an
  inline `# migration-check: allow-destructive` comment, checked via
  source scan) fits a specific operation that needs a deliberate,
  visible acknowledgement right where it happens. A route's
  `(method, path)` is living code — it can be renamed or refactored
  with nothing keeping a central list in sync — so it fits the
  inline-marker precedent, not the central-list one. The marker travels
  with the function, disappears when the route is deleted, and comes
  out in the same diff as the fix during Phases 3-7.
  (`ALLOWLISTED_REVISIONS` itself was subsequently removed from
  `check_migrations.py` — see the next entry — leaving
  `DESTRUCTIVE_MARKER` as the sole surviving precedent)
- **Two distinct marker strings (`allow-opaque-grandfathered` vs
  `allow-opaque-permanent`) rather than one** — Keeps Phase 8's
  completion check meaningful — it counts only the grandfathered marker
  and expects zero, while the permanent marker (on the binary
  `FileResponse` routes) is expected to persist forever without that
  meaning the retrofit is incomplete
- **Binary `FileResponse` routes get a separate, permanent marker
  rather than being retrofitted** — They serve raw bytes, not a JSON
  object — there is no `properties` shape to ever document, so
  "opaque" here isn't a gap, it's correct. Using a distinct marker
  string (not the retrofit-tracking `allow-opaque-grandfathered`) makes
  that permanence explicit rather than looking like unfinished work
- **Phase boundaries follow the feature-area groupings from the Explore
  survey, not a flat alphabetical or file-order list** — Each phase
  stays within one reviewable feature area (matching how
  `/follow-the-plan-document`'s human-review-per-unit gate is meant to
  work), and mirrors the existing well-typed precedents (messaging,
  teaching router) that each phase should converge toward
- **Phase 8 deletes `allow-opaque-grandfathered` recognition from the
  checker entirely, rather than leaving it as an always-empty,
  discouraged-by-comment marker** — `ALLOWLISTED_REVISIONS` in
  `check_migrations.py` was a weaker precedent, worth deviating from
  rather than copying: it stayed as live code that would honour a new
  entry, relying purely on a "do NOT add new revisions here" comment to
  stop anyone. A route's grandfathered marker is a single comment line
  above a decorator — far lower friction to add than a whole migration
  revision — so once the retrofit is done, the checker itself should
  stop recognising the string, closing the bypass structurally instead
  of trusting convention. This same reasoning led to removing
  `ALLOWLISTED_REVISIONS` from `check_migrations.py` outright
  (`feature/remove-allowlisted-revisions`), rather than leaving it in
  place as dead-but-discouraged code
- **Route <-> source cross-referencing goes through the running
  `app.routes`, not a pure source-file AST scan** — Matching an
  OpenAPI-spec path like `/api/organisations/{org_id}` back to the
  Python function that defines it requires resolving every
  `APIRouter(prefix=...)` and `app.include_router(prefix=...)` in play;
  the running app already does this resolution to build both `app.routes`
  and the OpenAPI spec, so re-deriving it from source would duplicate
  FastAPI's own routing logic and risk drifting from it. Each
  `app.routes` entry's `.endpoint` is cross-referenced against a
  per-file AST index (built once per file, keyed by function name) to
  find the marker comment and return-type annotation.
  `slowapi`'s `@limiter.limit(...)` decorator wraps the endpoint in a
  function defined inside `slowapi`'s own package, so
  `inspect.getsourcefile()` on a rate-limited route's raw `.endpoint`
  resolves to `slowapi/extension.py`, not the app's route file —
  `inspect.unwrap()` (a no-op on undecorated endpoints) is required
  before the file lookup to reach the real source location
- **`get_patient`, `create_patient_in_fhir`, and `update_patient` get a
  real `FhirPatientResource` Pydantic model, not a permanent-opaque
  marker or an envelope** — These three return the raw FHIR `Patient`
  resource JSON as the _entire_ response body, with no wrapping object;
  they can't gain `properties` by adding an envelope key without
  changing the response shape (a breaking API change requiring
  expand-contract). The only non-breaking fix was a real model.
  `FhirPatientResource` models the fields Quill's own `fhir_client.py`
  actually sets/reads (`resourceType`, `id`, `name`, `telecom`,
  `gender`, `birthDate`, `address`, `identifier`, `extension`, `active`)
  rather than the full FHIR R4 Patient specification, with
  `extra="allow"` so any other field the HAPI FHIR server returns
  (`meta`, `text`, `communication`, etc.) still passes through
  unchanged instead of being silently dropped. Considered and rejected:
  extending `allow-opaque-permanent` to these routes — Phase 8's text
  implies only Phase 7 was expected to add further permanent markers,
  and it would leave the original oasdiff blind spot (the bug that
  started this plan) unfixed for these three routes specifically
- **Other FHIR/EHRbase passthrough routes (`list_patients`,
  `get_demographics`, `upsert_demographics`'s response,
  `read_letter`, `list_letters`) only needed their existing envelope
  typed, not a full resource model** — `is_opaque_schema` in
  `check_api_schema_coverage.py` only inspects a response's _top-level_
  schema: for an object schema, `"properties" in schema` short-circuits
  to "not opaque" without recursing into what each property's own type
  is (recursion only happens for array `items` and `anyOf`/`oneOf`
  branches at the top level). So a response model like
  `{patient_id: str, data: dict[str, Any]}` already satisfies the
  checker — it matches what `oasdiff` can actually do (diff whether a
  top-level field appeared/disappeared), even though `data`'s internal
  shape stays opaque. `data`/`letters` fields were deliberately left as
  `dict[str, Any]` / `list[dict[str, Any]]` rather than over-modelled to
  match this
- **`upsert_demographics`'s request body did not need to stay
  dynamic** — Contrary to its own docstring ("FHIR-compatible fields"),
  the only consumer, `update_fhir_patient`
  (`app/fhir_client.py:297`), reads exactly six fixed keys
  (`given_name`, `family_name`, `date_of_birth`, `sex`, `address`,
  `contact`), not an arbitrary FHIR resource fragment. Typed as
  `DemographicsIn` with `extra="forbid"`. This tightened validation
  surfaced a real behaviour change: the existing
  `test_update_patient_demographics` test sent `{"name": "Updated
Name"}`, a field the endpoint silently ignored under the old
  `dict[str, Any]` body — now correctly rejected with 422. Fixed the
  test's payload to use real field names and added
  `test_update_patient_demographics_rejects_unknown_field` to cover the
  new rejection behaviour as a regression test
