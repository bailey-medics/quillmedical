# Cybersecurity implementations

Technical overview of the security controls implemented across the Quill Medical platform. This document covers authentication, authorisation, infrastructure hardening, input validation, frontend protections, and CI/CD security tooling.

For the detailed audit findings and penetration test results, see the [Security review plan](../plans/security-review.md).

## Authentication

### Password hashing

Passwords are hashed with **Argon2id** (via `argon2-cffi`) using OWASP-recommended defaults:

| Parameter | Value |
|-----------|-------|
| Algorithm | Argon2id |
| time_cost | 3 |
| memory_cost | 65536 (64 MiB) |
| parallelism | 4 |

Passwords are never stored in plain text. Verification uses constant-time comparison to prevent timing attacks.

### JWT tokens

All authentication tokens are signed JWTs using **HS256** with a minimum 32-character secret (enforced by Pydantic `min_length=32`).

| Token | Lifetime | Scope |
|-------|----------|-------|
| Access token | 15 minutes | All API routes |
| Refresh token | 7 days | Restricted to `/api/auth/refresh` path only |
| Password reset token | 30 minutes | Signed with `itsdangerous.URLSafeTimedSerializer` |

### Session invalidation

A `token_version` column on the User model is embedded as a `tv` claim in every JWT. On password change or reset, `token_version` is incremented, immediately invalidating all previously issued access and refresh tokens.

### Cookie configuration

Authentication cookies follow defence-in-depth principles:

| Cookie | HttpOnly | SameSite | Secure | Path |
|--------|----------|----------|--------|------|
| `access_token` | Yes | Lax | Yes (prod) | `/` |
| `refresh_token` | Yes | Lax | Yes (prod) | `/api/auth/refresh` |
| `XSRF-TOKEN` | No (read by JS) | Lax | Yes (prod) | `/` |

- `SECURE_COOKIES` defaults to `false` in development, explicitly set to `true` in production via `compose.prod.cloud-run.yml` and Terraform.
- `COOKIE_DOMAIN` is configurable per environment (defaults to current domain).

### CSRF protection

State-changing requests (POST, PUT, PATCH, DELETE) are protected by the **double-submit cookie** pattern:

1. On login, the server sets a signed `XSRF-TOKEN` cookie (readable by JavaScript).
2. The frontend API client extracts this value and includes it as an `X-CSRF-Token` header on every mutating request.
3. The backend `require_csrf` dependency verifies the header token matches the cookie and is signed for the correct user.
4. Token signing uses `itsdangerous.URLSafeSerializer` with the JWT secret and a `csrf` salt.

### Two-factor authentication (TOTP)

- **Standard**: RFC 6238 (TOTP), 30-second time steps, ±1 step clock drift tolerance.
- **Library**: `pyotp`.
- **Secret**: 32-character Base32, generated per user via `pyotp.random_base32()`.
- **Provisioning**: `otpauth://` URI for QR code scanning (Google Authenticator, Authy, etc.).
- **Disabling**: Requires password re-entry to prevent session-hijack attacks from silently removing 2FA.

### Rate limiting

Application-level rate limiting is enforced via `slowapi`:

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 5 per minute |
| `POST /api/auth/register` | 3 per minute |
| `POST /api/auth/forgot-password` | 3 per minute |
| `POST /api/auth/totp/setup` | 5 per minute |
| `POST /api/auth/totp/verify` | 5 per minute |
| `POST /api/auth/totp/disable` | 5 per minute |

In production, **GCP Cloud Armor WAF** provides additional global rate limiting at the load balancer level.

### Anti-enumeration

- **Login**: Returns a generic "Invalid credentials" message regardless of whether the username exists.
- **Registration**: Returns "Username or email already in use" for both duplicate username and duplicate email (no field-specific error).
- **Forgot password**: Always returns `{"detail": "ok"}` — does not reveal whether the email is registered.
- **Conversation access**: Returns 404 (not 403) for unauthorised conversation access, preventing IDOR enumeration.

## Authorisation

### System permissions

A four-level hierarchical permission system:

```
patient < staff < admin < superadmin
```

- Permission checks use `check_permission_level(user_permission, required_permission)` which compares hierarchy positions.
- External user types (`external_hcp`, `patient_advocate`) are treated as `patient` level for hierarchy checks.
- Admin endpoints explicitly check `system_permissions in ["admin", "superadmin"]`.

### CBAC (competency-based access control)

Healthcare-specific authorisation layer for clinical operations:

- **Competency resolution**: `final_competencies = base_profession_competencies + additional_competencies - removed_competencies`
- **Configuration**: Defined in `shared/competencies.yaml` (capabilities with risk levels) and `shared/base-professions.yaml` (profession templates).
- **Enforcement**: `has_competency("competency_id")` FastAPI dependency — raises 403 if the user lacks the required competency.
- **Self-modification blocked**: Only admin/superadmin users can modify competencies via `PATCH /cbac/my-competencies`.

### Route protection (frontend)

- **`<RequireAuth>`**: Redirects unauthenticated users to `/login`.
- **`<GuestOnly>`**: Redirects authenticated users away from login/register pages.
- **`<RequirePermission level="admin">`**: Enforces permission hierarchy client-side. Patients and staff see 404 for admin routes (feature hiding). Backend always re-validates.

## Input validation and injection prevention

### Pydantic schema hardening

- All request schemas use `model_config = ConfigDict(extra="forbid")` to reject unexpected fields (prevents mass assignment attacks).
- Email fields use `EmailStr` (Pydantic + `email-validator`) for RFC-compliant validation.
- Password minimum length standardised to 8 characters across all endpoints (aligned with NIST SP 800-63B).

### SQL injection

- All database queries use **SQLAlchemy ORM** with parameterised queries — no string concatenation.
- FHIR queries use object-based construction via the `fhirclient` library.

### XSS prevention

- **Backend (email)**: `nh3.clean()` sanitises Markdown-to-HTML output in email templates.
- **Frontend (rendering)**: `DOMPurify` sanitises all Markdown content before rendering, with an allowlist of safe tags and attributes. Only `http`, `https`, `mailto`, `tel`, relative, and `#` URLs are permitted.
- **Infrastructure**: Content Security Policy (`script-src 'self'`) blocks inline scripts.

### SSRF and command injection

No user-controllable URLs are used for server-side requests. FHIR and EHRbase service URLs are configured via environment variables, not user input.

## Infrastructure security

### HTTP security headers

Enforced by the Caddy reverse proxy on all responses:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (2 years) |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://storage.googleapis.com; font-src 'self'; connect-src 'self'; frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Server` | Removed |

### TLS

TLS termination is handled by the **GCP Global HTTPS Load Balancer** with a Google-managed certificate. The Caddy container listens on port 80 behind the load balancer. HSTS with preload ensures browsers always use HTTPS.

### Docker security

- **Non-root user**: Containers run as `appuser` (UID 10001).
- **Multi-stage builds**: Build dependencies are not included in production images.
- **Base images**: Slim/Alpine variants, digest-pinned for reproducibility.
- **Network isolation**: Backend and databases are on a `private` network not exposed to the host. Only the Caddy/frontend container is on the `public` network.

### Secrets management

- All secrets are typed as `SecretStr` (Pydantic) — they are never serialised or logged.
- `.env` files are in `.gitignore` — never committed.
- Production secrets are managed via **GCP Secret Manager** and injected as environment variables by Cloud Run.
- `JWT_SECRET` enforces `min_length=32` at startup.

### CORS

- Development: `["*"]` (permissive for local development).
- Production: Explicitly configured via `CORS_ORIGINS` environment variable in Cloud Run.

## Frontend security

### API client

The centralised API client (`frontend/src/lib/api.ts`) enforces security patterns:

- **Credentials**: All requests use `credentials: "include"` to send authentication cookies.
- **CSRF**: Automatically extracts the `XSRF-TOKEN` cookie and includes it as `X-CSRF-Token` header on all mutating requests.
- **Auto-refresh**: On 401 response, silently POSTs to `/api/auth/refresh` and retries once. If refresh fails, redirects to `/login`.
- **No raw fetch**: All components use this client — raw `fetch` is prohibited by convention.

### Markdown rendering

The `MarkdownView` component uses DOMPurify with a strict allowlist:

- Only specific HTML tags and attributes are permitted.
- URLs are validated against an allowlist of schemes (`http`, `https`, `mailto`, `tel`).
- Script injection via Markdown is blocked.

## CI/CD security pipeline

### Static analysis

| Tool | Scope | Trigger |
|------|-------|---------|
| **Bandit** | Python security linting (backend, excluding tests) | Pre-commit hook on every commit |
| **Semgrep** | JavaScript/TypeScript security rules (frontend) | CI pipeline on every PR |
| **Ruff** | Python linting rules including security-relevant checks (E, F, W, I, UP, B) | Pre-commit hook |
| **mypy --strict** | Type safety — catches type confusion and null safety issues | Pre-commit hook and CI |

### Dependency scanning

| Tool | Scope | Frequency |
|------|-------|-----------|
| **Dependabot** | Vulnerability alerts for pip, npm, Docker, Terraform, GitHub Actions | Weekly scan against `main` and `clinical-live` |
| **Renovate** | Version-bump PRs with 3-tier severity policy | Continuous; critical/high CVEs trigger immediate hotfix branches |

### Penetration testing

Automated security regression tests run monthly (and on-demand) via `.github/workflows/security-pentest.yml`:

- **38 tests** in `backend/tests/test_security_pentest.py` covering:
    - Property-based crypto round-trips (Hypothesis, 200 examples each)
    - JWT manipulation attacks (alg:none, wrong secret, expired, tampered, stale token_version)
    - CSRF bypass attempts (missing header, forged token, cross-user token)
    - Authentication attacks (rate limiting, anti-enumeration, password policy)
    - Privilege escalation (user→admin, CBAC self-update)
    - Injection testing (SQL injection, XSS, extra fields, fuzz testing)
    - Cookie security and unauthenticated endpoint protection
- **Schedule**: 1st of each month at 03:00 UTC.
- **Artefacts**: JUnit XML results uploaded with 90-day retention.
- **Notifications**: Slack alert on failure.

### Recommended improvements

| Priority | Item | Status |
|----------|------|--------|
| Medium | Enable GitHub secret scanning / push protection | Pending (repository setting) |
| Medium | Migrate `python-jose` → `PyJWT` | Pending (eliminates ecdsa CVE-2024-23342) |
| Low | Encrypt TOTP secrets at rest | Under consideration |

## Healthcare-specific controls

### PHI protection

- **No PHI in logs**: Logging captures request method, path, status, and timing — never patient data or credentials.
- **No PHI in error messages**: Error responses contain generic messages, not database contents.
- **Audit trail**: All clinical document modifications are tracked via EHRbase's built-in versioning.

### Clinical data integrity

- **Three-database architecture**: Authentication (PostgreSQL), demographics (HAPI FHIR), and clinical documents (EHRbase) are isolated — a breach of one does not compromise all data.
- **FHIR compliance**: Patient demographics use the HL7 FHIR standard for interoperability and validation.
- **OpenEHR compliance**: Clinical letters and documents follow the OpenEHR archetype model with immutable versioning.
- **Idempotent operations**: Critical clinical operations use the `get_or_create_ehr` pattern to prevent duplicate records.
