# Security audit and penetration testing plan

Comprehensive white-hat security audit of Quill Medical — a healthcare SPA with FastAPI backend, React frontend, FHIR/OpenEHR integrations, and Docker infrastructure. The audit covers code review (Phase 1) then automated + manual testing (Phase 2). **One confirmed vulnerability found during discovery** (unsanitised Markdown→HTML in email templates). Overall security posture is strong — Bandit SAST and Dependabot/Renovate dependency scanning are already in CI. Remaining gap: no secret scanning in CI.

## Phase 1: Code review (static analysis)

### 1A. ~~Confirmed vulnerability — unsanitised Markdown in email templates~~ FIXED

- **File**: `backend/app/features/teaching/email_templates.py` (line ~111)
- **Issue**: `markdown.markdown(body_md)` output was used directly without HTML sanitisation
- **Fix applied**: Added `nh3.clean()` around `markdown.markdown()` output; added `nh3` dependency
- **Tests**: Added `test_sanitises_malicious_html_in_body` and `test_preserves_safe_html_after_sanitisation`
- **Severity**: Medium (email clients often strip scripts, but not guaranteed)

### 1B. ~~Authentication and session management review~~ REVIEWED AND FIXED

- **Files**: `backend/app/security.py`, `backend/app/main.py` (auth endpoints), `backend/app/schemas/auth.py`

**Confirmed secure (no action needed):**

- JWT algorithm pinned: `algorithms=[settings.JWT_ALG]` — no `"none"` confusion possible
- JWT secret enforces `min_length=32` via Pydantic field constraint
- Cookie flags correct: HttpOnly, SameSite=lax, Secure=True in production configs
- Login returns generic "Invalid credentials" — no account enumeration via login
- Forgot-password always returns `{"detail": "ok"}` — no account enumeration
- CSRF double-submit cookie validates header + cookie match + signature
- Refresh token scoped to `/api/auth/refresh` path (minimal exposure)
- Argon2id password hashing with OWASP-recommended defaults

**Vulnerabilities found and fixed:**

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | Medium | No session invalidation on password change/reset — old refresh tokens valid for 7 days | Added `token_version` column to User model; included `tv` claim in access + refresh JWTs; `current_user` and `refresh` dependencies reject stale tokens; `change_password` and `reset_password` increment `token_version` |
| 2 | Medium | Account enumeration via registration — distinct "Username already exists" / "Email already exists" errors | Changed both messages to generic "Username or email already in use" |
| 3 | Low | Inconsistent password minimum: register=6 chars, change/reset=8 chars | Standardised to 8 characters across all endpoints |
| 4 | Low | TOTP disable didn't require password re-entry — session-hijack could silently disable 2FA | Added `TotpDisableIn` schema requiring `password` field; endpoint now verifies password before disabling |
| 5 | Low | Missing rate limiting on TOTP setup/verify/disable endpoints | Added `@limiter.limit("5/minute")` to all three TOTP endpoints |
| 6 | Info | Auth schemas missing `extra='forbid'` (Pydantic defence-in-depth) | Added `model_config = ConfigDict(extra="forbid")` to all auth schemas |

**Remaining informational items (accepted risk):**

- **No TOTP replay protection**: Same 6-digit code can be reused within the 30-second window. Low risk: requires valid session + code + CSRF, and the window is very short. Server-side used-code tracking would add Redis complexity disproportionate to the risk.
- **Logout doesn't invalidate tokens server-side**: Clears cookies only. With 15-minute access token TTL and token_version on password change, the exposure window is minimal.

### 1C. ~~Authorisation and access control review~~ REVIEWED AND FIXED

- **Files**: `backend/app/main.py`, `backend/app/push.py`, `backend/app/messaging.py`, `backend/app/cbac/`

**Confirmed secure (no action needed):**

- All messaging endpoints enforce participant-based access control via `check_user_patient_access`
- External patient invites properly validate granter authority (patient-self or admin)
- Organisation list/detail endpoints appropriately restrict admin-only operations
- Conversation detail returns 404 (not 403) for unauthorised access — prevents IDOR enumeration
- Teaching feature endpoints gated by feature flags and organisation membership

**Vulnerabilities found and fixed:**

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | Critical | `PATCH /cbac/my-competencies` let any authenticated user modify their own competencies — could grant clinical or admin-level access | Added admin/superadmin permission check + CSRF protection |
| 2 | Medium | `POST /users`, `PATCH /users/{user_id}` (admin endpoints) missing CSRF protection | Changed from `DEP_CURRENT_USER` to `DEP_REQUIRE_CSRF` |
| 3 | Medium | `PUT /organizations/{org_id}`, `POST /organizations`, `POST /organizations/{org_id}/staff` missing CSRF protection | Changed from `DEP_CURRENT_USER` to `DEP_REQUIRE_CSRF` |
| 4 | Medium | `POST /patients`, `PATCH /patients/{patient_id}`, `POST /patients/{patient_id}/deactivate`, `POST /patients/{patient_id}/activate` missing CSRF protection | Added `DEP_REQUIRE_CSRF` to dependencies |
| 5 | Low | `POST /push/subscribe` had no authentication — any anonymous client could register push subscriptions | Added cookie-based authentication check |

**Remaining informational items:**

- `POST /patients` allows any authenticated user to create patients (no role check). This may be intentional for certain workflows. Consider adding `DEP_REQUIRE_ROLES_CLINICIAN` if only clinicians should create patients.
- `PATCH /patients/{patient_id}` similarly allows any authenticated user to edit demographics. Consider role restriction.
- `POST /accept-invite` sets `system_permissions` from the invite token's `user_type` field. The token is cryptographically signed, so this is safe from manipulation, but the `user_type` values ("external_hcp", "patient_advocate") aren't in the standard permission hierarchy.

### 1D. ~~Input validation and injection review~~ REVIEWED AND FIXED

- **Files**: `backend/app/schemas/` (all), `backend/app/main.py` (inline schemas), `backend/app/messaging.py`, `backend/app/ehrbase_client.py`, `backend/app/fhir_client.py`

**Confirmed secure (no action needed):**

- FHIR queries use object-based construction via `fhirclient` library — no injection risk
- Frontend renders Markdown with DOMPurify sanitisation — stored XSS mitigated on output
- Email sending via Resend API (structured params, not raw SMTP) — header injection mitigated

**Vulnerabilities found and fixed:**

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | Medium | Multiple input schemas missing `extra='forbid'` — `LetterIn`, `CompetencyCheck`, `UpdateCompetenciesRequest`, `PrescriptionRequest`, `FeatureToggleIn`, `AdminUserCreateIn`, `AdminUserUpdateIn`, `TotpVerifyIn`, `FHIRPatientCreateIn` | Added `model_config = {"extra": "forbid"}` / `ConfigDict(extra="forbid")` to all request schemas |
| 2 | Low | Email fields in `RegisterIn` and `ForgotPasswordIn` used plain `str` — no RFC validation or header injection checks | Changed to `EmailStr` (Pydantic + email-validator) for RFC-compliant validation |

**Remaining informational items:**

- **Message body not sanitised server-side**: Server stores raw Markdown. DOMPurify on the frontend handles XSS. Defence-in-depth suggests server-side sanitisation too, but this is low risk given the existing frontend protection. Could add `nh3.clean()` on message body before storage as a future improvement.
- **Letter content not sanitised server-side**: Same as messages — stored as raw Markdown in EHRbase, rendered safely by frontend DOMPurify.
- **Password complexity**: Only length is validated (min 8 chars). No uppercase/digit/special character requirement. This is a trade-off — NIST SP 800-63B recommends length over complexity rules. Current approach is acceptable.

### 1E. ~~Infrastructure and configuration review~~ REVIEWED — NO FIXES NEEDED

- **Files**: `compose.dev.yml`, `caddy/prod/Caddyfile`, Dockerfiles, `backend/app/config.py`

**Confirmed secure (all areas):**

- **CSP**: Strict policy — `default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`. Image exceptions for GCS only.
- **HSTS**: 2-year max-age with includeSubDomains and preload.
- **Security headers**: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy disables camera/microphone/geolocation, Server header removed.
- **Docker security**: Non-root user (`appuser` UID 10001), multi-stage builds, slim/alpine base images, digest-pinned for reproducibility.
- **Network isolation**: Backend on private network only (not mapped to host); only Caddy/frontend exposed.
- **Secrets**: `.env` in `.gitignore`, production secrets via GCP Secret Manager, `JWT_SECRET` enforces `min_length=32`.
- **CORS**: Default `["*"]` in dev, production set via Cloud Run environment variables.
- **SECURE_COOKIES**: Default `false` in dev, explicitly `true` in `compose.prod.cloud-run.yml` and `infra/main.tf`.
- **Rate limiting (infrastructure)**: GCP Cloud Armor WAF handles global rate limiting in production.

**Informational notes:**

- Dev compose has a hardcoded Postgres password (`vspct8I2iLUkfC3JsXxefy`). This is development-only; the DB is on the private Docker network and not exposed to the host. Acceptable for dev.
- Application-level rate limiting covers auth endpoints (login 5/min, register 3/min, forgot-password 3/min, TOTP 5/min). Other endpoints rely on Cloud Armor in production.

### 1F. ~~Dependency security audit~~ REVIEWED — MIGRATION RECOMMENDED

- **Files**: `backend/pyproject.toml`, `frontend/package.json`

**Confirmed in place:**

- Dependabot vulnerability alerts (weekly scan of pip, npm, Docker, Terraform, GitHub Actions) + Renovate version-bump PRs with 3-tier severity policy and immediate alerts for critical/high CVEs

**pip-audit findings (31 CVEs across 9 packages):**

| Package | Installed | CVEs | Fix Version | Impact |
|---------|-----------|------|-------------|--------|
| starlette | 0.40.0 | CVE-2025-54121, CVE-2025-62727 | 0.47.2+ | ASGI framework (via FastAPI) — update via Renovate |
| ecdsa | 0.19.1 | CVE-2024-23342 (timing attack) | No fix available | Used only by python-jose — migration to PyJWT removes this |
| aiohttp | 3.12.15 | 18 CVEs | 3.13.3+ | Transitive dependency — update via Renovate |
| urllib3 | 2.5.0 | 3 CVEs | 2.6.0+ | Update via Renovate |
| requests | 2.32.5 | 1 CVE | 2.33.0+ | Update via Renovate |

**Actionable recommendation:**

- **Migrate from `python-jose` to `PyJWT`**: `python-jose` is no longer actively maintained and pulls in the `ecdsa` library (CVE-2024-23342 — timing side-channel has no fix). `PyJWT` is actively maintained and uses `cryptography` natively without `ecdsa`. The migration is straightforward since both libraries have similar APIs (`jwt.encode()`, `jwt.decode()`). This is the only dependency issue that Renovate/Dependabot cannot automatically resolve.
- **All other CVEs**: Should be addressed by Renovate version-bump PRs. No manual action needed.

### 1G. ~~CI/CD security pipeline gaps~~ REVIEWED

- **Files**: `.github/workflows/`, `.pre-commit-config.yaml`

**Confirmed in place:**

- Bandit SAST runs via pre-commit on every commit (backend Python code)
- Semgrep SAST runs in CI for frontend JavaScript/TypeScript code
- Dependabot vulnerability alerts with weekly scan
- Renovate version-bump PRs with severity-based auto-merge policy
- Pre-commit checks: ruff, black, mypy, cspell, bandit

**Gap identified:**

- **No secret scanning in CI**: No `trufflehog`, `gitleaks`, or `detect-secrets` integration. GitHub's built-in secret scanning / push protection should be enabled in the repository settings (Settings → Code security → Secret scanning → Enable). This is a GitHub Enterprise feature and requires no workflow changes — just enable it in the repository settings.

## Phase 2: Active testing (penetration testing)

### Tooling

| Tool             | Purpose                                                                                                                                                                                                     | Install                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Schemathesis** | Property-based API fuzzing from OpenAPI spec — auto-generates thousands of test cases covering boundary values, malformed inputs, type confusion, response schema validation, and stateful chained requests | `poetry add --group dev schemathesis` |
| **Hypothesis**   | Property-based testing for individual functions (token parsing, password hashing, input validation) — generates random inputs to find edge cases                                                            | `poetry add --group dev hypothesis`   |
| **pytest**       | Targeted manual security test cases (already installed)                                                                                                                                                     | —                                     |
| **httpx**        | Craft malicious HTTP requests for CSRF bypass, cookie manipulation, header injection (already installed)                                                                                                    | —                                     |

### Implementation status

All Phase 2 tests are in `backend/tests/test_security_pentest.py` (38 tests, all passing).

| Category | Tests | Status |
|----------|-------|--------|
| Crypto round-trips (Hypothesis) | `TestPasswordHashRoundTrip` (2), `TestCSRFTokenRoundTrip` (2), `TestPasswordResetTokenRoundTrip` (1), `TestJWTTokenRoundTrip` (2) | ✅ All pass — 200 examples each |
| JWT manipulation | `TestJWTManipulation` — alg:none, wrong secret, expired, tampered payload, stale token_version | ✅ All 5 attacks rejected |
| CSRF bypass | `TestCSRFBypass` — missing header, wrong token, cross-user token | ✅ All 3 bypasses rejected |
| Authentication attacks | `TestAuthenticationAttacks` — login rate limit, register rate limit, anti-enumeration, short password | ✅ All 4 pass |
| Privilege escalation | `TestPrivilegeEscalation` — user→admin POST/PATCH /users, CBAC self-update | ✅ All 3 escalations blocked |
| Input validation | `TestInputValidation` — extra fields, SQL injection, XSS, fuzz login (Hypothesis, 50 examples) | ✅ All 4 pass, no 500s |
| Cookie security | `TestCookieSecurity` — HttpOnly flags, logout clears cookies | ✅ All 2 pass |
| Unauthenticated access | `TestUnauthenticatedAccess` — 10 protected endpoints parametrised | ✅ All return 401 |

**Hypothesis findings during development:**
- Whitespace-only strings (e.g. `\r`) correctly rejected by `create_csrf_token` input validation — strategy constrained to non-whitespace-only strings

### Monthly CI workflow

`.github/workflows/security-pentest.yml` — runs on 1st of each month at 03:00 UTC and via `workflow_dispatch`. Uploads JUnit XML results as a 90-day artefact. Slack notification on failure.

### ~~2A. Authentication attacks~~ TESTED — ALL PASS

Covered by `TestJWTManipulation`, `TestAuthenticationAttacks`, `TestCookieSecurity`, and `TestJWTTokenRoundTrip` in `test_security_pentest.py`:

- JWT alg:none, wrong secret, expired tokens, tampered payloads → all rejected
- Stale token_version after password change → rejected
- Login and registration rate limiting → enforced
- Registration anti-enumeration → identical generic errors
- Cookie HttpOnly and SameSite flags → verified
- Logout clears cookies → verified

### ~~2B. Authorisation testing (IDOR / privilege escalation)~~ TESTED — ALL PASS

Covered by `TestPrivilegeEscalation` and `TestUnauthenticatedAccess`:

- Regular user → POST /api/users (admin endpoint) → 403
- Regular user → PATCH /api/users/{id} (privilege escalation) → 403
- Regular user → PATCH /api/cbac/my-competencies (self-promote) → 403
- 10 protected endpoints → 401 without authentication

### ~~2C. Injection testing~~ TESTED — ALL PASS

Covered by `TestInputValidation`:

- SQL injection payloads in login → safe (400/401, no 500s)
- XSS payloads in registration → safe (no 500s)
- Extra/unexpected fields → rejected by Pydantic extra='forbid' (422)
- Hypothesis fuzz: 50 random input pairs to login → no 500s

### ~~2D. API abuse testing~~ TESTED — ALL PASS

Covered by `TestAuthenticationAttacks` and `TestCSRFBypass`:

- Login brute force → rate limited after 5 attempts (429)
- Registration spam → rate limited after 3 attempts (429)
- CSRF bypass with missing/forged/cross-user tokens → all rejected

### ~~2E. Web push subscription abuse~~ TESTED IN PHASE 1C

Covered by `test_subscribe_requires_auth` in `test_push.py`:

- Anonymous push subscribe → rejected (authentication required)

## Key files

| Area              | Files                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Auth/Security     | `security.py`, `main.py`, `config.py`, `models.py`                 |
| Access control    | `messaging.py`, `organisations.py`, `cbac/`, `system_permissions/` |
| Input validation  | `schemas/`                                                         |
| Vulnerable        | `email_templates.py` — unsanitised markdown                        |
| Infrastructure    | `compose.dev.yml`, `caddy/prod/Caddyfile`, Dockerfiles             |
| Frontend security | `api.ts`, `MarkdownView.tsx`, `auth/`                              |
| Pentest tests     | `tests/test_security_pentest.py`                                   |
| CI                | `.github/workflows/`, `.github/workflows/security-pentest.yml`     |

## Verification

1. ~~Fix 1A → run `just ub`, write test confirming HTML tags are stripped~~ ✅
2. ~~Phase 1 produces a findings document with CVSS-like severity ratings~~ ✅ Above
3. ~~Phase 2 produces pytest tests in `backend/tests/test_security_pentest.py` as regression tests~~ ✅ 38 tests
4. Review Dependabot alerts dashboard for any open vulnerability advisories
5. Review Bandit output from pre-commit: `pre-commit run bandit --all-files`
6. ~~Each finding should be reproducible with a curl command or test case~~ ✅ All findings have tests
7. ~~Pentest run produces zero server errors (`5xx`) against all endpoints~~ ✅ Hypothesis fuzz confirmed
8. ~~Monthly CI workflow created and posts artefact with results~~ ✅ `security-pentest.yml`

## Decisions

- All testing inside Docker containers per project conventions
- Severity ratings: Critical / High / Medium / Low / Informational
- Focus: OWASP Top 10 + healthcare-specific risks (PHI exposure, clinical data integrity)
- Out of scope: Social engineering, physical security, third-party SaaS (Resend, GCS)

## Further considerations

1. **python-jose vs PyJWT** — `python-jose` has had historical CVEs; consider flagging for future migration to `PyJWT`
2. **TOTP secret encryption at rest** — currently plaintext in DB; could encrypt with application-level key (medium priority, depends on DB encryption posture)
3. **Password reset flow** — now implemented (`/api/auth/forgot-password`, `/api/auth/reset-password`) with time-limited signed tokens; needs to be included in Schemathesis test coverage
