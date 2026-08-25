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
    `_serve_cover_image`, `_serve_learning_image`), with a one-line
    reason (serves raw bytes, not JSON — no `properties` shape will ever
    apply). Not expected to ever reach zero, and that's fine — Phase 8
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

- [ ] Add `# api-schema-check: allow-opaque-grandfathered` above each of
      the 73 currently-opaque routes (full list below, from the Explore
      survey) so the check passes immediately without blocking on the
      retrofit
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
that model, `response_model=` on the decorator. Delete the
`# api-schema-check: allow-opaque-grandfathered` marker above each route
as it's fixed.

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
