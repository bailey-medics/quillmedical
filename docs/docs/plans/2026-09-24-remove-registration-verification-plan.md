# Remove registration verification plan

An assessor's professional registration can be marked "verified" by an
organisation administrator, who looks the number up on the real register by
hand and records in Quill that they did. Quill queries no register itself, so
the flag records a human's assertion rather than a checked fact.

**No other ePortfolio does this, and there is no reason for Quill to be the
first.** The feature was built, never reached from the interface, and never
used: `passport_assessor_registration_verification` holds zero rows. It is
carried in the sign-off record, printed on rendered passports and their PDFs,
and enforced by a validator, all for a flag nothing sets. This plan removes it
entirely.

## What makes this cheap

Two things that could have made it expensive, and do not:

- **It is not in the fingerprint.** `signed_off_by.registration_verified` is
  listed in `NON_CONTRIBUTING` in `hashing.py`, so no stored `content_hash`
  was ever computed over it. Removing the field changes no hash, invalidates
  no record, and needs no hash version bump.
- **Nothing has used it.** The table is empty and no page calls
  `verifyAssessorRegistration`, the one frontend function that would write a
  row. There is no data to migrate and no user to warn.

The reason it is in `NON_CONTRIBUTING` is worth keeping in mind while reading
the rest: verification was designed to happen *after* signing, so it deliberately
sat outside the thing it confirmed. That is also why nothing else depends on it.

## Phase 1: The write path

- [x] **Delete `verify_assessor_registration`** and its route,
      `POST /assessors/{assessor_user_id}/registration-verification`, from
      `backend/app/features/passport/router.py`.

- [x] **Delete `RegistrationVerifyIn` and `RegistrationVerificationOut`** from
      `backend/app/schemas/passport.py`, and their imports in the router.

- [x] **Write an api-compatibility decision file.** Removing a route is a
      breaking change and `oasdiff` will flag it. Use
      `python backend/scripts/new_compat_decision.py`, and answer
      `forces_reload: false`: no open tab calls this route, so no client needs
      to reload to stop using it.

- [x] **Remove `verifyAssessorRegistration` and its two types from the
      frontend client in the same unit.** Moved forward from phase 3:
      `PASSPORT_PATHS` in `api.ts` mirrors the backend's `EXPECTED_PATHS`,
      and `api.test.ts` compares the two, so the route and the client
      function that calls it have to go together or one side's test fails.

      `_require_org_admin_over` stays: the revoke route uses it too. The one
      router test that proved a clinician without `manage_users` is refused
      went through the verification route, so it now goes through revoke
      rather than being lost.

## Phase 2: The record

- [x] **Remove `registration_verified` from the sign-off schema** in
      `backend/app/features/passport/schemas.py`, and from
      `backend/app/schemas/passport.py`.

- [x] **Remove the `verified`, `verified_by` and `verified_on` fields from
      `Registration`**, along with the `_verification_names_who_and_when`
      validator that keeps them consistent. The validator exists only to stop
      a half-filled verification, and there is nothing left to half-fill.

- [x] **Drop the `registration_verified` argument from
      `service.write_sign_off`** and stop passing it through.

- [x] **Remove `signed_off_by.registration_verified` from `NON_CONTRIBUTING`**
      in `hashing.py`. `CONTRIBUTING` is untouched, which is the point: no
      hash changes.

      Leaving a stale entry would be worse than removing it. The map exists to
      answer "what about X" for a reader, and naming a field that no longer
      exists sends them looking for it.

- [x] **Keep old records readable.** Found while building, and the one
      thing the plan missed. Records are serialised with
      `exclude_none=True`, which keeps `False`, so every sign-off already
      written carries `registration_verified: false` and every registration
      in it carries `verified: false`. `PassportModel` forbids unknown
      fields, so deleting the fields outright would have made every existing
      sign-off and profile fail to load.

      `Registration` and `Assessor` each gain a `mode="before"` validator
      that drops those retired keys, and only those, before validation. Any
      other unknown key is still refused. This is the tolerant reader
      pattern ([Fowler](https://martinfowler.com/bliki/TolerantReader.html)),
      narrowed to named keys so `extra="forbid"` keeps doing its job, and is
      the approach Pydantic documents for reshaping input before field
      validation
      ([validators](https://docs.pydantic.dev/latest/concepts/validators/#model-validators)).
      Bumping `SCHEMA_VERSION` was the alternative, and was rejected: the
      change is a removal of fields nothing set, and a version bump would
      mean a migration path for every record to say so.

      The keys are dropped whatever their value. Nothing ever passed
      `registration_verified=True`, and the only writer of `verified` wrote
      `False`, so nothing true is lost.

- [x] **Remove the fields from the API responses too.** `RegistrationOut`
      and `AssessorOut` carried the same fields, served by the passport,
      assessor search, inbox and sign-off routes. `oasdiff` flags each
      property on each route separately, so this unit carries twenty
      decision files, all `forces_reload: false`: the values were always
      false or empty, and a stale tab missing them shows a registration as
      declared, which is what it always showed.

## Phase 3: What people see

- [x] **Stop rendering the verified marker** in
      `backend/app/features/passport/render.py` and `pdf.py`. Both print it
      beside the assessor's registration on a signed-off competency.

      **Passports already exported keep whatever they say.** A PDF is a file
      somebody holds; nothing here reaches back into one. Since the flag was
      never set, every exported passport already shows an unverified
      registration, so no issued document becomes misleading.

      **What they say instead.** A registration now reads "declared" and a
      sign-off's assessor "registration as declared", where they read
      "declared, not verified". The front-page paragraph, the export
      README and the passport repository README now say Quill checks no
      register and a reader relying on one should look it up there. Saying
      "not verified" implies verification is something that happens here.

- [ ] **Remove `RegistrationVerification`, `verifyAssessorRegistration` and
      the type's export** from `frontend/src/lib/passport/api.ts`, `types.ts`
      and `index.ts`.

- [ ] **Remove `registration_verified` from
      `frontend/src/components/passport/fixtures.ts`.**

## Phase 4: The table

- [ ] **Delete the `AssessorRegistrationVerification` model** from
      `backend/app/features/passport/models.py`, and the line describing it in
      the module docstring.

- [ ] **Drop the table with `just migrate "drop assessor registration
      verification"`.** A destructive migration, so it needs the
      `# migration-check: allow-destructive` marker and the
      `db-destructive-migration-review` environment approval, which is a human
      action nothing in the diff can satisfy.

      **The table is empty**, which is worth saying in the migration's
      docstring: an approver's first question is what is being lost, and the
      answer is nothing.

      Its `downgrade()` recreates the table, matching
      `2026_09_13_0850-3530eb2d528b` which created it. The earlier migration
      is not edited or deleted; a merged migration's code is frozen, and this
      one supersedes it.

## Phase 5: Tests

- [ ] **Delete the tests that exercise the route, the model and the schema
      fields**, across `test_passport_router.py`, `test_passport_models.py`,
      `test_passport_api_schemas.py`, `test_passport_api_contract.py`,
      `test_passport_service.py` and `frontend/src/lib/passport/api.test.ts`.

- [ ] **Check `test_passport_hashing.py` separately.** It asserts over
      `NON_CONTRIBUTING`, so removing an entry may change a count or a
      membership test. The assertion that matters, that `CONTRIBUTING` is
      unchanged, must still pass: it is what proves no stored hash moved.

- [ ] **Run the full backend suite.** This touches `schemas.py` and
      `models.py`, which `CLAUDE.md` names as wide blast radius, so the usual
      "only test what you touched" rule does not apply.

## What this does not change

- **No stored `content_hash` moves**, because the field never contributed to
  one. Every existing sign-off verifies exactly as before.
- **`professional_registrations` on `User` stays.** An assessor still declares
  their registering body and number when they accept an invitation, and a
  sign-off still records what they declared. Only the claim that somebody
  checked it goes.
- **Nothing about who may assess changes.** This is orthogonal to
  [the passport assessor access plan](2026-09-24-passport-assessor-access-plan.md).
