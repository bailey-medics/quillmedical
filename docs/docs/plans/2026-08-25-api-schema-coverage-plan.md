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
*Pydantic-typedness*, a narrower property mypy doesn't check.

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
what `oasdiff` can see, so no *new* opaque route ships silently, and (2)
retrofit the 73 existing opaque routes to typed Pydantic response models,
phased by feature area so each phase stays reviewable.

## Phase 1: API schema coverage check script

- [ ] Add `backend/scripts/check_api_schema_coverage.py`, mirroring the
      structure of `backend/scripts/check_migrations.py` (pure-stdlib
      where possible; this one needs to import the FastAPI app to get the
      OpenAPI spec, same as `backend/scripts/dump_openapi.py` already
      does)
- [ ] The script generates the OpenAPI spec (reuse
      `dump_openapi.py`'s generation logic rather than duplicating it —
      import and call it, or extract a shared helper if needed) and walks
      every path+method's response schema for the success status code
- [ ] Flag any response schema that resolves to a bare `{"type":
      "object"}` with no `properties` key, or has no schema at all — this
      is precisely the shape `oasdiff` cannot diff
- [ ] Add an `ALLOWLISTED_ROUTES: frozenset[tuple[str, str]]` constant
      (method, path pairs), following the exact pattern of
      `ALLOWLISTED_REVISIONS` in `check_migrations.py` — a comment noting
      "do not add new routes here, fix the return type instead" for
      anything added during Phase 2's grandfathering
      - [ ] The 3 binary `FileResponse` image-serving routes
            (`_serve_teaching_image`, `_serve_cover_image`,
            `_serve_learning_image`) get a **separate, permanent**
            allowlist category (e.g. `PERMANENTLY_OPAQUE_ROUTES`) since
            they serve raw bytes, not JSON — there is no "properties"
            shape to ever document for these
- [ ] `--all` CLI flag matching `check_migrations.py`'s convention, exit
      non-zero listing every offending route (method + path + file:line)
      when run with no allowlisted routes remaining unaccounted for
- [ ] Regression tests in `backend/tests/test_api_schema_coverage.py`
      (mirroring `backend/tests/test_alembic_check.py`'s structure) —
      cover: a typed route passes, an opaque route fails, an allowlisted
      opaque route passes, a `FileResponse` route in the permanent
      allowlist passes
- [ ] `just ub -k test_api_schema_coverage` — new tests pass

## Phase 2: Grandfather existing gaps and wire into CI

- [ ] Populate `ALLOWLISTED_ROUTES` with all 73 currently-opaque routes
      (full list below, from the Explore survey) so the check passes
      immediately without blocking on the retrofit
- [ ] Add a `check-api-schema-coverage` hook to `.pre-commit-config.yaml`,
      following the `check-migrations` hook's shape: `entry: python3
      backend/scripts/check_api_schema_coverage.py --all`, `language:
      system`, scoped to `files: ^backend/app/.*\.py$` so it only reruns
      when route files change
- [ ] Confirm the hook runs clean on the current branch (0 unexpected
      opaque routes beyond the allowlist)
- [ ] `just ub` — full backend suite still green (no behavioural change
      yet, this phase is tooling + grandfathering only)

## Phase 3: Retrofit — auth & health (16 routes)

Define a Pydantic response model per route (or reuse one across routes
with an identical shape — several `dict[str, str]` "detail" responses may
collapse into a single shared model) and set both the function's return
type annotation and, where the return value isn't already an instance of
that model, `response_model=` on the decorator. Remove each route from
`ALLOWLISTED_ROUTES` as it's fixed.

- [ ] `health_check` — GET `/health`
- [ ] `login` — POST `/auth/login`
- [ ] `list_organisations_public` — GET `/auth/organisations`
- [ ] `register` — POST `/auth/register`
- [ ] `verify_email` — POST `/auth/verify-email`
- [ ] `resend_verification` — POST `/auth/resend-verification`
- [ ] `forgot_password` — POST `/auth/forgot-password`
- [ ] `reset_password` — POST `/auth/reset-password`
- [ ] `totp_verify` — POST `/auth/totp/verify`
- [ ] `totp_disable` — POST `/auth/totp/disable`
- [ ] `change_password` — POST `/auth/change-password`
- [ ] `logout` — POST `/auth/logout`
- [ ] `me` — GET `/auth/me`
- [ ] `update_profile` — PATCH `/auth/profile`
- [ ] `refresh` — POST `/auth/refresh`
- [ ] `list_teaching_modules_public` — GET `/teaching/public/modules`
- [ ] `just ub -k "auth or health or teaching_public"` — targeted rerun
- [ ] `just ub` — full backend suite

## Phase 4: Retrofit — users & admin (9 routes)

- [ ] `validate_clinical_lead` — POST
      `/teaching/public/validate-clinical-lead`
- [ ] `create_user_with_cbac` — POST `/users`
- [ ] `update_user` — PATCH `/users/{user_id}`
- [ ] `deactivate_user` — POST `/users/{user_id}/deactivate`
- [ ] `reactivate_user` — POST `/users/{user_id}/reactivate`
- [ ] `send_invite_email` — POST `/users/{user_id}/send-invite`
- [ ] `list_users` — GET `/users`
- [ ] `get_user` — GET `/users/{user_id}`
- [ ] `link_patient_to_user` — PATCH `/users/{user_id}/link-patient`
      (also takes a raw `dict[str, str]` request body — type the request
      too, not just the response)
- [ ] `just ub -k "user"` — targeted rerun
- [ ] `just ub` — full backend suite

## Phase 5: Retrofit — patients / FHIR / EHRbase (18 routes)

- [ ] `create_patient_record` — POST `/patients/verify`
- [ ] `list_patients` — GET `/patients`
- [ ] `upsert_demographics` — PUT `/patients/{patient_id}/demographics`
      (also takes a raw `dict[str, Any]` request body — type the request
      too; check whether this genuinely needs to stay dynamic given FHIR
      payload variability, and if so document why in this plan's
      Decisions table rather than silently leaving it opaque)
- [ ] `get_demographics` — GET `/patients/{patient_id}/demographics`
- [ ] `write_letter` — POST `/patients/{patient_id}/letters`
- [ ] `read_letter` — GET `/patients/{patient_id}/letters/{composition_uid}`
- [ ] `list_letters` — GET `/patients/{patient_id}/letters`
- [ ] `create_patient_in_fhir` — POST `/patients`
- [ ] `get_patient` — GET `/patients/{patient_id}`
- [ ] `update_patient` — PATCH `/patients/{patient_id}`
- [ ] `get_patient_metadata` — GET `/patients/{patient_id}/metadata`
- [ ] `deactivate_patient` — POST `/patients/{patient_id}/deactivate`
- [ ] `activate_patient` — POST `/patients/{patient_id}/activate`
- [ ] `shared_organisations_endpoint` — GET
      `/patients/{patient_id}/shared-organisations`
- [ ] `invite_external_user` — POST `/patients/{patient_id}/invite-external`
- [ ] `accept_invite` — POST `/accept-invite`
- [ ] `revoke_external_access` — DELETE
      `/patients/{patient_id}/external-access/{user_id}`
- [ ] `list_external_access` — GET
      `/patients/{patient_id}/external-access`
- [ ] `just ub -k "patient or fhir or ehrbase or letter"` — targeted
      rerun
- [ ] `just ub` — full backend suite

## Phase 6: Retrofit — organisations & sites (24 routes)

- [ ] `list_organisations` — GET `/organisations`
- [ ] `get_organisation` — GET `/organisations/{org_id}` (the originally
      -reported route)
- [ ] `update_organisation` — PUT `/organisations/{org_id}`
- [ ] `create_organisation` — POST `/organisations`
- [ ] `delete_organisation` — DELETE `/organisations/{org_id}`
- [ ] `add_staff_to_organisation` — POST `/organisations/{org_id}/staff`
- [ ] `add_patient_to_organisation` — POST
      `/organisations/{org_id}/patients`
- [ ] `remove_staff_from_organisation` — DELETE
      `/organisations/{org_id}/staff/{user_id}`
- [ ] `remove_patient_from_organisation` — DELETE
      `/organisations/{org_id}/patients/{patient_id}`
- [ ] `list_org_features` — GET `/organisations/{org_id}/features`
- [ ] `toggle_org_feature` — PUT
      `/organisations/{org_id}/features/{feature_key}`
- [ ] `list_sites` — GET `/sites`
- [ ] `create_site` — POST `/sites`
- [ ] `get_site` — GET `/sites/{site_id}`
- [ ] `update_site` — PUT `/sites/{site_id}`
- [ ] `toggle_site_active` — PATCH `/sites/{site_id}/active` (also takes
      a raw `dict[str, bool]` request body — type the request too)
- [ ] `delete_site` — DELETE `/sites/{site_id}`
- [ ] `link_site_to_org` — POST `/organisations/{org_id}/sites/{site_id}`
- [ ] `unlink_site_from_org` — DELETE
      `/organisations/{org_id}/sites/{site_id}`
- [ ] `add_site_staff` — POST `/sites/{site_id}/staff` (also takes a raw
      `dict[str, Any]` request body — type the request too)
- [ ] `remove_site_staff` — DELETE `/sites/{site_id}/staff/{user_id}`
- [ ] `just ub -k "organisation or site"` — targeted rerun
- [ ] `just ub` — full backend suite

## Phase 7: Retrofit — remaining outliers (11 routes)

Routes that slipped through in otherwise well-typed feature areas, plus
the two smaller route files.

- [ ] `prescribe_controlled` — POST `/prescriptions/controlled`
      (`backend/app/main.py`) — sibling CBAC routes already use
      `response_model=UserCompetenciesResponse`; follow that pattern
- [ ] `mark_read_endpoint` — POST
      `/conversations/{conversation_id}/read` (`backend/app/main.py`) —
      sole opaque route among 9 fully `response_model`-typed messaging
      siblings
- [ ] `ci_teaching_sync` — POST `/ci/teaching/sync` (`backend/app/main.py`)
- [ ] `subscribe` — POST `/api/push/subscribe` (`backend/app/push.py`)
- [ ] `send_test` — POST `/api/push/send-test`
      (`backend/app/push_send.py`)
- [ ] `download_certificate` — GET
      `/api/teaching/assessments/{assessment_id}/certificate`
      (`backend/app/features/teaching/router.py`) — returns a raw PDF
      `Response`; likely belongs in the permanent
      `PERMANENTLY_OPAQUE_ROUTES` allowlist alongside the image-serving
      routes rather than being retrofitted, since there's no JSON shape
      to type — decide during this phase and record the outcome in the
      Decisions table
- [ ] `just ub -k "prescription or conversation or push or certificate"`
      — targeted rerun
- [ ] `just ub` — full backend suite

## Phase 8: Final verification

- [ ] `ALLOWLISTED_ROUTES` in `check_api_schema_coverage.py` is empty
      (only `PERMANENTLY_OPAQUE_ROUTES` remains, holding the binary
      `FileResponse` routes and any routes Phase 7 decided belong there)
- [ ] `python backend/scripts/check_api_schema_coverage.py --all` passes
      with zero unexpected findings
- [ ] `just ub` — full backend unit suite
- [ ] Push and confirm the `pre-commit` CI job runs the new hook cleanly
- [ ] Manually verify `oasdiff` now has real schema to diff: temporarily
      remove a field from one retyped response locally, confirm
      `oasdiff breaking` (per `backend/scripts/dump_openapi.py`) flags it,
      then revert — proves the fix actually closes the detection gap
      that started this plan

## Decisions

| Decision | Rationale |
| --- | --- |
| OpenAPI-spec-based check, not an AST heuristic on return-type annotations | Measures exactly what `oasdiff` can see — the real downstream artifact — rather than approximating it. An AST check on annotations would need to special-case every way FastAPI can end up with a typed schema (`response_model=`, a Pydantic return type, `response_model` inherited from a router-level default), which the spec-walk sidesteps entirely |
| Grandfather all 73 existing routes into an allowlist rather than blocking on the full retrofit before shipping the check | Mirrors `check_migrations.py`'s `ALLOWLISTED_REVISIONS` precedent for a pre-existing-history squash. Lets Phase 1's tooling ship immediately and stop new opaque routes from landing, while the retrofit proceeds incrementally and reviewably across Phases 3-7 |
| Binary `FileResponse` routes get a separate, permanent allowlist category rather than being retrofitted | They serve raw bytes, not a JSON object — there is no `properties` shape to ever document, so "opaque" here isn't a gap, it's correct. Keeping them in a distinct constant (not the retrofit-tracking `ALLOWLISTED_ROUTES`) makes that permanence explicit rather than looking like unfinished work |
| Phase boundaries follow the feature-area groupings from the Explore survey, not a flat alphabetical or file-order list | Each phase stays within one reviewable feature area (matching how `/follow-the-plan-document`'s human-review-per-unit gate is meant to work), and mirrors the existing well-typed precedents (messaging, teaching router) that each phase should converge toward |
