# Security audit and penetration testing plan

Comprehensive white-hat security audit of Quill Medical — a healthcare SPA with FastAPI backend, React frontend, FHIR/OpenEHR integrations, and Docker infrastructure. The audit covers code review (Phase 1) then automated + manual testing (Phase 2). **One confirmed vulnerability found during discovery** (unsanitised Markdown→HTML in email templates). Overall security posture is strong — Bandit SAST and Dependabot/Renovate dependency scanning are already in CI. Remaining gap: no secret scanning in CI.

## Phase 1: Code review (static analysis)

### 1A. Confirmed vulnerability — unsanitised Markdown in email templates

- **File**: `backend/app/features/teaching/email_templates.py` (line ~111)
- **Issue**: `markdown.markdown(body_md)` output is used directly without HTML sanitisation
- **Risk**: Stored XSS if email body contains malicious HTML/JS rendered by email client
- **Fix**: Sanitise output with `nh3` or `bleach` before passing to the email send function
- **Severity**: Medium (email clients often strip scripts, but not guaranteed)

### 1B. Authentication and session management review

- **Files**: `backend/app/security.py`, `backend/app/main.py` (auth endpoints)
- Check: JWT algorithm confusion, secret strength, token lifetime, refresh rotation
- Check: Cookie flags (HttpOnly, Secure, SameSite, Path)
- Check: TOTP replay/timing attacks, rate limiting on TOTP attempts
- Check: Session invalidation on logout/password change (are old tokens revoked?)
- Check: Account enumeration via login/register error messages

### 1C. Authorisation and access control review

- **Files**: `backend/app/main.py`, `backend/app/organisations.py`, `backend/app/messaging.py`, `backend/app/system_permissions/`, `backend/app/cbac/`
- Check: Every endpoint has appropriate auth dependency (DEP_CURRENT_USER, role/permission/CBAC checks)
- Check: IDOR vulnerabilities — can user A access user B's resources by guessing IDs?
- Check: Privilege escalation — can a `staff` user access `admin` endpoints?
- Check: CBAC resolution logic — can additional/removed competencies be manipulated?
- Check: External patient access grants — proper validation of granter authority

### 1D. Input validation and injection review

- **Files**: `backend/app/schemas/` (all), route handlers in `main.py`
- Check: All Pydantic schemas use `extra='forbid'` consistently
- Check: Password complexity requirements
- Check: Email validation (RFC compliance, header injection prevention)
- Check: Message body sanitisation (XSS in stored messages)
- Check: Patient search parameters (injection via FHIR queries)
- Check: Letter content handling (stored XSS via clinical letters)

### 1E. Infrastructure and configuration review

- **Files**: `compose.dev.yml`, `caddy/prod/Caddyfile`, Dockerfiles, `backend/app/config.py`
- Check: Production CSP policy completeness
- Check: Docker container security (non-root confirmed, check for exposed debug ports)
- Check: Secret management (no hardcoded secrets, proper .gitignore)
- Check: CORS production configuration
- Check: Rate limiting thresholds (login, register, API endpoints)

### 1F. Dependency security audit

- **Files**: `backend/pyproject.toml`, `frontend/package.json`
- Already in place: Dependabot vulnerability alerts (weekly scan of pip, npm, Docker, Terraform, GitHub Actions) + Renovate version-bump PRs with 3-tier severity policy and immediate alerts for critical/high CVEs
- No additional `pip-audit` / `yarn audit` needed in CI — Dependabot covers the same CVE databases
- Check: `python-jose` vs `PyJWT` (`python-jose` has had vulnerabilities historically)

### 1G. CI/CD security pipeline gaps

- **Files**: `.github/workflows/`, `.pre-commit-config.yaml`
- Already in place: Bandit SAST runs via pre-commit (`bandit -r backend -x backend/tests`) in the `Python styling` CI job
- Already in place: Dependabot vulnerability alerts + Renovate version-bump PRs for dependency security
- Gap identified: No secret scanning in CI
- Recommendation: Add secret scanning to CI pipeline

## Phase 2: Active testing (penetration testing)

### 2A. Authentication attacks

- Brute force login with rate limit bypass attempts
- JWT manipulation (alg:none, key confusion, expired token reuse)
- CSRF bypass attempts (missing header, mismatched tokens, cross-origin)
- TOTP replay attacks (reuse same code within window)
- Cookie theft scenarios (check SameSite, Secure flags)

### 2B. Authorisation testing (IDOR / privilege escalation)

- Access other users' conversations by manipulating conversation IDs
- Access other patients' records by manipulating patient IDs
- Escalate from patient → staff → admin via API manipulation
- CBAC bypass: send additional_competencies in profile update without admin
- Org membership: access resources across organisations

### 2C. Injection testing

- SQL injection via ORM bypass (special chars in username, email, search)
- XSS via message body, letter content, patient names
- SSRF via any user-controllable URLs (webhook endpoints, etc.)
- Command injection via any file processing endpoints

### 2D. API abuse testing

- Mass enumeration of user/patient/conversation IDs
- Rate limit exhaustion and bypass
- Large payload attacks (oversized message bodies, excessive participants)
- Concurrent request race conditions (double-spend patterns)

### 2E. Web push subscription abuse

- Flood fake endpoints
- Subscription without authentication verification
- Notification content injection

## Key files

| Area              | Files                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Auth/Security     | `security.py`, `main.py`, `config.py`, `models.py`                 |
| Access control    | `messaging.py`, `organisations.py`, `cbac/`, `system_permissions/` |
| Input validation  | `schemas/`                                                         |
| Vulnerable        | `email_templates.py` — unsanitised markdown                        |
| Infrastructure    | `compose.dev.yml`, `caddy/prod/Caddyfile`, Dockerfiles             |
| Frontend security | `api.ts`, `MarkdownView.tsx`, `auth/`                              |
| CI                | `.github/workflows/`                                               |

## Verification

1. Fix 1A → run `just ub`, write test confirming HTML tags are stripped
2. Phase 1 produces a findings document with CVSS-like severity ratings
3. Phase 2 produces pytest tests in `backend/tests/test_security_audit.py` as regression tests
4. Review Dependabot alerts dashboard for any open vulnerability advisories
5. Review Bandit output from pre-commit: `pre-commit run bandit --all-files`
6. Each finding should be reproducible with a curl command or test case

## Decisions

- All testing inside Docker containers per project conventions
- Severity ratings: Critical / High / Medium / Low / Informational
- Focus: OWASP Top 10 + healthcare-specific risks (PHI exposure, clinical data integrity)
- Out of scope: Social engineering, physical security, third-party SaaS (Resend, GCS)

## Further considerations

1. **python-jose vs PyJWT** — `python-jose` has had historical CVEs; consider flagging for future migration to `PyJWT`
2. **TOTP secret encryption at rest** — currently plaintext in DB; could encrypt with application-level key (medium priority, depends on DB encryption posture)
3. **No password reset flow** — users who forget passwords have no self-service recovery; this is a UX gap but also means no reset token attack surface exists currently
