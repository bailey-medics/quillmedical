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

- [ ] Put the user's `token_version` in the password reset payload, in
      `create_password_reset_token`, and have `verify_password_reset_token`
      return it alongside the email. The reset route in `main.py` (line
      963) already bumps `token_version` after a reset, so comparing the
      token's copy with the user's refuses a link that has been used,
      without a table or a new column. Today a reset link works as many
      times as it is opened inside its thirty minutes, after the password
      has been changed. The email-verify token stays as it is: verifying
      twice is harmless.

- [ ] Change `create_password_reset_token`'s callers to pass the
      version, and the reset route to compare it, answering the same
      error as an expired link so the response does not say which
      failed. Test the second use of one link in
      `backend/tests/`, beside the existing reset tests. Run `just ub -k
      "reset"`.

## Phase 5: Password hashes can be strengthened later

- [ ] Add `password_needs_rehash(h: str) -> bool`, wrapping
      `PasswordHasher.check_needs_rehash`, and have the login route
      re-hash and store the password when it returns true after a
      successful verify. Without this the Argon2 parameters of every
      existing hash are frozen at whatever they were when the user set
      their password, and raising them has no effect until each user
      changes it. Drop the parameter numbers from the `hash_password`
      docstring: they quote a library default that changes without the
      docstring knowing.

- [ ] Test that a hash made with lower parameters reports needing a
      rehash and that login replaces it. Run `just ub -k "password"`.

## Phase 6: One dead-code scan, by hand

- [ ] Run Vulture once over the backend, from the repository root, with
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
