# Security module tidy plan

A read of `backend/app/security.py` on 15 October 2026 found nothing that
lets anyone in who should be kept out, but several things that make the
module heavier and easier to misuse than it needs to be. The access token
carries every competency id a user holds and their role names, and nothing
reads either: `get_current_user` in `backend/app/deps.py` takes `sub` and
`tv` from the token and resolves roles and competencies from the database
on every request. Four functions have no caller outside the file and its
own tests, and in two cases the live function is the one labelled legacy
or lacks the input guard its dead twin has. Two verifiers catch every
exception, so a programming error reads as a bad token.

The aim is one minter per token kind, a cookie that carries only what is
read, verifiers that refuse for named reasons, and a one-off dead-code
scan at the end to see whether the rot found here is wider than this file.

## Phase 1: Slim the access token

- [x] Make `create_access_token(sub, token_version)` the only access
      token minter, in `backend/app/security.py`. Drop its `roles`
      parameter and the `roles` claim, and delete
      `create_jwt_with_competencies` and `decode_jwt_with_competencies`.
      The `competencies` claim lists every competency id the user holds,
      and with the passport frameworks a user can hold hundreds; the
      cookie grows with each grant, towards the browser's limit of about
      four kilobytes per cookie, and reveals the user's full competency
      list to anything that can read the cookie. Neither claim is read:
      `deps.py` line 71 rebuilds `request.state.roles` from `user.roles`,
      and every competency check calls `user.get_final_competencies()`.
      The token's shape is not part of the OpenAPI spec, so `oasdiff` is
      not involved; a token minted by the old code still decodes, because
      `_read` only requires `exp` and `type`.

- [x] Change the three callers in `backend/app/main.py`, at the login,
      password-change and refresh routes (lines 602, 1238 and 1471 at
      the time of writing), to `create_access_token(user.username,
      user.token_version)`. The `roles` list in `LoginOut` stays: the
      frontend reads it from the response body, not the token. The
      `competencies` local in each route goes with the call.

- [x] Update `backend/app/security_test.py`: the tests of the two deleted
      functions go, `test_create_access_token` loses its roles argument,
      and a new test asserts that a decoded access token carries exactly
      `sub`, `type`, `tv` and `exp`, so a claim cannot creep back in
      unnoticed. Run `just ub app/security_test.py` and `just ub -k
      "login or refresh"`.

## Phase 2: Delete the dead duplicates

- [x] Delete `create_csrf_token` and move its empty-username guard into
      `make_csrf`, which is the function every caller uses despite its
      docstring calling it the legacy alias. Rewrite that docstring to
      describe the function rather than its history. Delete
      `generate_totp_provision_uri`; the TOTP (time-based one-time
      password) setup route in `main.py` uses `totp_provisioning_uri`.
      Both were confirmed unused by grep over `backend/app`,
      `backend/scripts` and `backend/tests`, excluding `_test.py` files.

- [x] Add the same guard to `create_refresh_token`, which is the one
      minter with no check on an empty subject. Every caller passes
      `user.username`, so this is consistency with the fail-fast rule in
      `CLAUDE.md` rather than a live bug.

- [x] Remove the tests of the two deleted functions from
      `security_test.py` and add one for each new guard. Run `just ub
      app/security_test.py`.

## Phase 3: Verifiers refuse for named reasons

- [x] In `verify_csrf`, catch `BadSignature` rather than `Exception`.
      `itsdangerous` raises `BadSignature` (or a subclass) for every bad
      token; anything else is a bug in our code and should surface.
      Compare the subject with `hmac.compare_digest` so the compare takes
      the same time whichever character differs. The signature check
      already defeats forgery, so this is uniformity, not a fix.

- [x] In `verify_totp_code`, catch `ValueError` and `binascii.Error`,
      which is what `pyotp` raises for a secret that is not valid Base32,
      rather than `Exception`.

- [x] In `verify_password_reset_token` and `verify_email_verify_token`,
      replace `except SignatureExpired, BadSignature:` with `except
      BadSignature:`. `SignatureExpired` is a subclass of `BadSignature`,
      so the single name says the same thing. (First written as a wish
      to avoid the bracket-free form, which reads like the Python 2
      mistake that bound the second name as a variable. Black, targeting
      3.14, strips the brackets from any `except (A, B):` here, so that
      form is the house style and the only reason left is the subclass.)

- [x] Add a test to `security_test.py` for each narrowed catch: a bad
      signature returns `False` or `None`, a malformed TOTP secret
      returns `False`, and a `TypeError` from a non-string token is not
      swallowed. Run `just ub app/security_test.py`.

## Phase 4: A reset link is spent when the password changes

- [x] Put the user's `token_version` in the password reset payload, in
      `create_password_reset_token`, and have `verify_password_reset_token`
      return it alongside the email. The reset route in `main.py` (line
      963) already bumps `token_version` after a reset, so comparing the
      token's copy with the user's refuses a link that has been used,
      without a table or a new column. Today a reset link works as many
      times as it is opened inside its thirty minutes, after the password
      has been changed. The email-verify token stays as it is: verifying
      twice is harmless.

- [x] Change `create_password_reset_token`'s callers to pass the
      version, and the reset route to compare it, answering the same
      error as an expired link so the response does not say which
      failed. Test the second use of one link in
      `backend/tests/`, beside the existing reset tests. Run `just ub -k
      "reset"`. Done 15 October 2026: `verify_password_reset_token`
      returns a `ResetClaims` named tuple (`email`, `token_version`)
      rather than a bare email, so the route reads both from one call;
      two test files outside the plan's list, `marketing_registration_test`
      and `user_reach_and_activation_refusals_test`, also minted or read
      the token and moved with it.

## Phase 5: Password hashes can be strengthened later

- [x] Add `password_needs_rehash(h: str) -> bool`, wrapping
      `PasswordHasher.check_needs_rehash`, and have the login route
      re-hash and store the password when it returns true after a
      successful verify. Without this the Argon2 parameters of every
      existing hash are frozen at whatever they were when the user set
      their password, and raising them has no effect until each user
      changes it. Drop the parameter numbers from the `hash_password`
      docstring: they quote a library default that changes without the
      docstring knowing. Departed from on 15 October 2026: the numbers
      stay, because `TestProductionPasswordHasher` in `security_test.py`
      pins exactly those values and says it does so "as security.py
      documents", so a change to the default fails a test rather than
      drifting.

- [x] Test that a hash made with lower parameters reports needing a
      rehash and that login replaces it. Run `just ub -k "password"`.

## Phase 6: One dead-code scan, by hand

- [x] Run Vulture once over the backend, from the repository root, with
      the tests excluded so a function kept alive only by its own test
      is reported:

      ```bash
      pipx run vulture backend/app --exclude '*_test.py' --min-confidence 80
      ```

      Vulture is not wired into pre-commit or CI, and this step does not
      add it: see Decisions. Record the findings in this plan, under this
      step, naming each one and whether it was deleted, kept as framework
      code (a route, a Pydantic validator, a SQLAlchemy relationship) or
      kept for a reason worth writing down. If the list is long, that is
      the evidence for a follow-up plan that wires the tool in with a
      whitelist; if it is a handful, deleting them here is the whole job.

      Run on 15 October 2026. At 80% confidence Vulture reports only
      unused variables, every one of them a Pydantic validator's `cls`
      or a parameter a library signature demands (reportlab, the GCS
      client). The unused functions sit at 60%, so the run that counts
      was at 60% with `--ignore-names cls` and `--ignore-decorators`
      for routes, exception handlers, middleware, validators and
      SQLAlchemy listeners: 550 lines. A script then grepped each name
      across `backend/` outside the tests, and kept only names with no
      reference at all beyond their definition. That left 21 functions,
      28 classes and 25 other names. Nothing was deleted: the list is
      long, each name needs reading in its own file, and that is the
      follow-up plan this step said such a list would call for.

      - **Functions with tests and no caller** (16) - `cbac/audit.py`:
        `retired_ids_in_practising_competencies`, `retired_ids_on_users`,
        `unknown_ids_in_base_professions`, `unknown_ids_on_users`,
        `unknown_ids_in_practising_competencies`;
        `cbac/competencies.py`: `_load_competencies`;
        `cbac/positions.py`: `holders_of`, `is_vacant`;
        `cbac/practising.py`: `who_can_practise_at`;
        `ehrbase_client.py`: `list_compositions_for_ehr`;
        `features/passport/commits.py`: `parse_trailers`;
        `features/passport/ids.py`: `is_timestamp_id`;
        `features/passport/service.py`: `status_for`;
        `features/teaching/email_templates.py`: `load_email_template`;
        `features/teaching/router.py`: `_resolve_bank_path`;
        `org_units/tree.py`: `root_id_of`;
        `organisations.py`: `remove_org_unit_memberships`;
        `passport_storage.py`: `using_bucket`, `reset_caches`. Some are
        an API kept on purpose (`who_can_practise_at` is documented in
        `CLAUDE.md`; the audit functions are the "report, not a rule"
        that `backend.md` describes), so each is a decision, not a
        deletion.
      - **Functions with no reference at all** (2) -
        `fhir_client.py`: `delete_fhir_patient`; `models.py`:
        `validate_site_capacity`. Likeliest true dead code.
      - **Pydantic schemas nothing imports** (28) - all of
        `schemas/organisations.py` except what `org_units/router.py`
        imports (22 classes, from `CreateOrganisationIn` to
        `AddSiteStaffResponse`: the pre-unification organisation and
        site API), `schemas/features.py` (`FeatureOut`,
        `FeatureToggleIn`), `schemas/cbac.py` (`CompetencyCheck`,
        `CompetencyCheckResponse`), `schemas/passport.py`
        (`CompetencyCatalogueOut`), `features/teaching/schemas.py`
        (`SyncTriggerIn`, `CoordinatorEmailIn`,
        `QuestionBankOrgStatusIn`, `QuestionBankOrgStatusOut`), and
        `messaging.py` (`SingleUserCannotSelfJoin`, raised by nothing).
        A schema no route names is not in the OpenAPI spec, so deleting
        it is not an API change.
      - **Reported but alive** (ignore in a follow-up whitelist) -
        `email/brand.py` attributes, read from the Jinja templates as
        `t.h1_size` and so on; `config.py` settings, read from the
        environment by pydantic-settings; `models.py` relationships
        `enabled_by_user` and `amended_message`, which SQLAlchemy
        resolves by name; `org_units/router.py`
        `DEP_REQUIRE_MANAGE_STAFF`, which is dead but its two siblings
        are not; and the constants in the "other" list, most of which a
        test imports to pin a vocabulary.

## Phase 7: Delete what the scan found to be obsolete

Phase 6's list was read name by name on 16 October 2026. Twelve entries
are obsolete: nothing outside their own tests refers to them, and a live
replacement exists or the reason they were kept has passed. The rest are
kept: the audit report, the positions and practising API that `CLAUDE.md`
documents, a test hook, and small helpers with a clear use ahead. One PR
for all twelve, since each is a deletion and one CI run checks them
together. None is in the OpenAPI spec, so `oasdiff` is not involved.

- [x] Delete `delete_fhir_patient` from `backend/app/fhir_client.py`.
      Nothing refers to it, not even a test, and its docstring says it
      is for development only.

- [x] Delete `validate_site_capacity` from `backend/app/models.py`. It
      forwarded to `validate_member_capacity` "for the site call sites",
      and none are left.

- [x] Delete `DEP_REQUIRE_MANAGE_STAFF` from
      `backend/app/org_units/router.py`.
      `DEP_REQUIRE_MANAGE_STAFF_OR_SCOPED` replaced it.

- [x] Delete the 28 pre-unification organisation and site schemas from
      `backend/app/schemas/organisations.py`, keeping only the three link
      schemas `org_units/router.py` imports. Phase 6 counted 22; it is
      every class above the links, `OrganisationListItem` included,
      because `main.py` imports the class of that name from
      `schemas/auth.py`, not this one.

- [x] Delete `backend/app/schemas/features.py`, whose two classes
      (`FeatureOut`, `FeatureToggleIn`) nothing imports, and its line in
      `docs/docs/backend/fastapi/index.md`.

- [x] Delete `CompetencyCheck` and `CompetencyCheckResponse` from
      `backend/app/schemas/cbac.py`, and `CompetencyCatalogueOut` from
      `backend/app/schemas/passport.py`.

- [x] Delete `SyncTriggerIn`, `CoordinatorEmailIn`,
      `QuestionBankOrgStatusIn` and `QuestionBankOrgStatusOut` from
      `backend/app/features/teaching/schemas.py`.

- [x] Delete `_resolve_bank_path` from
      `backend/app/features/teaching/router.py`.
      `_resolve_bank_path_or_gcs` replaced it and carries the same
      path-traversal guard, so the three traversal tests move to the live
      function rather than going with the dead one.

- [x] Delete `_load_competencies` from `backend/app/cbac/competencies.py`,
      a one-line wrapper over `_load_catalogue` used only by tests, which
      call `_load_catalogue(...)[0]` instead.

- [x] Delete `load_email_template` from
      `backend/app/features/teaching/email_templates.py`. The code uses
      `extract_email_template`, which its docstring already preferred.

- [x] Delete `SingleUserCannotSelfJoin` from `backend/app/messaging.py`:
      the contract half of the platform role change of 9 September, kept
      one deploy so the error code survived. Nothing in `frontend/src`
      matches on it.

- [x] Run the tests of every touched module: `just ub` with the paths of
      their test files. Done 16 October 2026: 477 passed, 3 skipped,
      across the competencies, grant scope, teaching router, email
      template, CI sync, messaging, FHIR client and passport schema
      tests and `tests/org_scoped_access_criteria_test.py`. Ruff then
      dropped the `Path` and `yaml` imports `load_email_template` had
      been the last user of.

## Decisions

- **No dead-code tool in pre-commit or CI** - dead code cannot run, so
  catching it is not a safety matter. Its cost is duplication, where the
  next change reaches for the wrong twin, and review time. A one-off run
  when rot is suspected catches that without a whitelist to maintain.
  Revisit if Phase 6 finds a long list.

- **Every token family shares `JWT_SECRET`, separated by salt** - left as
  it is. Rotating the secret would break the marketing unsubscribe links,
  which the module says must keep working for months; a separate secret
  for them is the fix if a rotation is ever planned, and it is a config
  change with its own plan, not a tidy.

- **`competencies` leaves the token rather than being read from it** -
  reading it from the token would save a database query per request but
  would mean a grant or removal takes effect only at the next refresh,
  up to fifteen minutes later. For a clinical system, the database answer
  on every request is the right trade.
