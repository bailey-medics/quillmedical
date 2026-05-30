# Account update plan

Add editable profile fields (full name, email) to a new `/settings/account` page alongside the existing password change form. Username remains read-only (healthcare standard — stable identifier in JWTs, CSRF tokens, audit trails).

## Phase 1: Backend — Profile update endpoint

- [x] Add `UpdateProfileIn` schema to `backend/app/schemas/auth.py` with optional `full_name: str | None` and `email: str | None`
- [x] Add `PATCH /auth/profile` endpoint in `backend/app/main.py`:
  - Requires CSRF (`DEP_REQUIRE_CSRF`)
  - Validates email format (if provided)
  - Checks email uniqueness (if changed)
  - Sets `email_verified = False` if email changes (triggers re-verification)
  - Updates `full_name` and/or `email` on the user
  - Returns updated user info
- [x] Add tests in `backend/tests/test_profile_update.py`
- [x] Keep password update logic

## Phase 2: Frontend — Rename and restructure page

- [x] Create `AccountPage.tsx` at `frontend/src/pages/settings/AccountPage.tsx`
- [x] Structure as one BaseCard with one form:
  - Full name (editable), username (disabled TextField, read-only), email (editable), divider, password fields — single `<Form>` wrapper with "Save" submit
- [x] Update route in `frontend/src/main.tsx`: change `/settings/password` → `/settings/account`
- [x] Update `Settings.tsx` ActionCard: rename subtitle and button label, update `buttonUrl` to `/settings/account`

## Phase 3: Tests and cleanup

- [x] Add frontend tests for AccountPage
- [x] Run backend tests (`just ub`)
- [x] Run frontend tests (`just uf`)
- [x] Remove old `ChangePassword.tsx`

## Decisions

| Decision                                                | Rationale                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Username is read-only                                   | Healthcare standard (NHS/EMIS/SystmOne); embedded in JWTs, CSRF, audit logs           |
| Email change resets `email_verified`                    | Consistent with registration flow; verification email already exists                  |
| Two independent forms on one page                       | Profile save doesn't require password fields, password change doesn't require profile |
| Route is `/settings/account`                            | Broader scope than just "password"                                                    |
| Call `reload()` from AuthContext after profile save     | So navigation shows updated name immediately                                          |
| Flag `email_verified = False` only (no immediate email) | Verification flow already handles sending; avoids coupling                            |

## Relevant files

- `backend/app/models.py` — User model (`full_name`, `email`, `email_verified` fields)
- `backend/app/schemas/auth.py` — Add `UpdateProfileIn` schema
- `backend/app/main.py` — Add `PATCH /auth/profile` endpoint (near `GET /auth/me`)
- `frontend/src/pages/ChangePassword.tsx` — Current password page (to be replaced)
- `frontend/src/pages/Settings.tsx` — Update ActionCard link
- `frontend/src/main.tsx` — Update route path

## Phase 4: Restrict self-registration in clinical environments

Currently `POST /auth/register` and the `/register` frontend route are available in all environments with no distinction. In clinical, user onboarding needs to be controlled — exact mechanism TBD (auto-generated username, admin approval queue, invite-only, etc.).

- [x] Guard `POST /auth/register` endpoint — return 403 when `CLINICAL_SERVICES_ENABLED` is `True` (placeholder until clinical registration flow is designed)
- [x] Frontend: redirect `/register` to `/login` when clinical services are enabled; hide "Register" link on login page
- [x] Tests: verify 403 when clinical enabled, verify 201 when clinical disabled (teaching)
- [ ] Future: design clinical registration flow (admin approval, auto-generated usernames, or invite-only)
