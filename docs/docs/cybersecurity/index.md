# Cybersecurity implementations

Technical overview of the security controls implemented across the Quill Medical platform. This document covers authentication (verifying who a user is), authorisation (controlling what they can do), infrastructure hardening, input validation, frontend protections, and continuous integration / continuous deployment (CI/CD) security tooling.

For the detailed audit findings and penetration test results, see the [Security review plan](../plans/security-review.md).

## Authentication

### Password hashing

Hashing is a one-way mathematical transformation — the original password cannot be recovered from the stored hash. Passwords are hashed with **Argon2id** (via `argon2-cffi`) using Open Worldwide Application Security Project (OWASP) recommended defaults:

| Parameter   | Value          |
| ----------- | -------------- |
| Algorithm   | Argon2id       |
| time_cost   | 3              |
| memory_cost | 65536 (64 MiB) |
| parallelism | 4              |

Passwords are never stored in plain text. Verification uses constant-time comparison to prevent timing attacks (where an attacker measures response speed to guess correct characters).

### JSON web token (JWT) tokens

All authentication tokens are signed JWTs — compact, digitally signed tokens that prove a user's identity without requiring a database lookup on every request. They use **HS256** (HMAC with SHA-256) with a minimum 32-character secret (enforced by Pydantic `min_length=32`).

| Token                | Lifetime   | Scope                                              |
| -------------------- | ---------- | -------------------------------------------------- |
| Access token         | 15 minutes | All application programming interface (API) routes |
| Refresh token        | 7 days     | Restricted to `/api/auth/refresh` path only        |
| Password reset token | 30 minutes | Signed with `itsdangerous.URLSafeTimedSerializer`  |

### Session invalidation

A `token_version` column on the User model is embedded as a `tv` claim in every JWT. On password change or reset, `token_version` is incremented, immediately invalidating all previously issued access and refresh tokens. This means that if a user changes their password, any tokens obtained before the change become unusable.

### Cookie configuration

Cookies are small pieces of data that the browser stores and sends back to the server with each request. Authentication cookies follow defence-in-depth principles:

| Cookie          | HttpOnly        | SameSite | Secure     | Path                |
| --------------- | --------------- | -------- | ---------- | ------------------- |
| `access_token`  | Yes             | Lax      | Yes (prod) | `/`                 |
| `refresh_token` | Yes             | Lax      | Yes (prod) | `/api/auth/refresh` |
| `XSRF-TOKEN`    | No (read by JS) | Lax      | Yes (prod) | `/`                 |

- **HttpOnly** prevents JavaScript from reading the cookie (protecting against cross-site scripting theft).
- **SameSite=Lax** prevents the cookie from being sent on most cross-site requests.
- **Secure** ensures the cookie is only sent over encrypted (HTTPS) connections.
- `SECURE_COOKIES` defaults to `false` in development, explicitly set to `true` in production via `compose.prod.cloud-run.yml` and Terraform.
- `COOKIE_DOMAIN` is configurable per environment (defaults to current domain).

### Cross-site request forgery (CSRF) protection

CSRF attacks trick a user's browser into making unwanted requests to a site where they are already logged in. State-changing requests (POST, PUT, PATCH, DELETE) are protected by the **double-submit cookie** pattern:

1. On login, the server sets a signed `XSRF-TOKEN` cookie (readable by JavaScript).
2. The frontend API client extracts this value and includes it as an `X-CSRF-Token` header on every mutating request.
3. The backend `require_csrf` dependency verifies the header token matches the cookie and is signed for the correct user.
4. Token signing uses `itsdangerous.URLSafeSerializer` with the JWT secret and a `csrf` salt.

This works because an attacker's website can trigger a request that includes the cookie, but cannot read the cookie value to include it in the header.

### Two-factor authentication (2FA) — time-based one-time password (TOTP)

2FA adds an extra layer of security beyond a password. TOTP generates a short-lived code (typically six digits) using an authenticator app on the user's phone.

- **Standard**: RFC 6238 (TOTP), 30-second time steps, ±1 step clock drift tolerance.
- **Library**: `pyotp`.
- **Secret**: 32-character Base32, generated per user via `pyotp.random_base32()`.
- **Provisioning**: `otpauth://` URI for QR code scanning (Google Authenticator, Authy, etc.).
- **Disabling**: Requires password re-entry to prevent session-hijack attacks from silently removing 2FA.

### Rate limiting

Rate limiting restricts how many requests a user can make in a given time window, preventing brute-force attacks (where an attacker tries many passwords rapidly). Application-level rate limiting is enforced via `slowapi`:

| Endpoint                         | Limit        |
| -------------------------------- | ------------ |
| `POST /api/auth/login`           | 5 per minute |
| `POST /api/auth/register`        | 3 per minute |
| `POST /api/auth/forgot-password` | 3 per minute |
| `POST /api/auth/reset-password`  | 5 per minute |
| `POST /api/auth/totp/setup`      | 5 per minute |
| `POST /api/auth/totp/verify`     | 5 per minute |
| `POST /api/auth/totp/disable`    | 5 per minute |

In production, **Google Cloud Platform (GCP) Cloud Armor web application firewall (WAF)** provides additional global rate limiting at the load balancer level.

### Anti-enumeration

Anti-enumeration prevents attackers from discovering valid usernames or email addresses by observing differences in error messages or response behaviour.

- **Login**: Returns a generic "Invalid credentials" message regardless of whether the username exists.
- **Registration**: Returns "Username or email already in use" for both duplicate username and duplicate email (no field-specific error).
- **Forgot password**: Always returns `{"detail": "ok"}` — does not reveal whether the email is registered.
- **Conversation access**: Returns 404 "not found" (not 403 "forbidden") for unauthorised conversation access, preventing insecure direct object reference (IDOR) enumeration.

## Authorisation

### System permissions

A four-level hierarchical permission system where each level inherits access from the levels below it:

```
patient < staff < admin < superadmin
```

- Permission checks use `check_permission_level(user_permission, required_permission)` which compares hierarchy positions.
- External user types (`external_hcp`, `patient_advocate`) are treated as `patient` level for hierarchy checks.
- Admin endpoints explicitly check `system_permissions in ["admin", "superadmin"]`.

### Competency-based access control (CBAC)

Healthcare-specific authorisation layer for clinical operations. Rather than simple role-based permissions, CBAC checks whether a user has a specific clinical competency (e.g. "can prescribe controlled drugs") before allowing an action.

- **Competency resolution**: `final_competencies = base_profession_competencies + additional_competencies - removed_competencies`
- **Configuration**: Defined in `shared/competencies.yaml` (capabilities with risk levels) and `shared/base-professions.yaml` (profession templates).
- **Enforcement**: `has_competency("competency_id")` FastAPI dependency — raises 403 if the user lacks the required competency.
- **Self-modification blocked**: Only admin/superadmin users can modify competencies via `PATCH /cbac/my-competencies`.

### Route protection (frontend)

These components wrap pages to control who can see them:

- **`<RequireAuth>`**: Redirects unauthenticated users to `/login`.
- **`<GuestOnly>`**: Redirects authenticated users away from login/register pages.
- **`<RequirePermission level="admin">`**: Enforces permission hierarchy client-side. Patients and staff see a "not found" page for admin routes (feature hiding). The backend always re-validates.
- **`<RequireClinical>`**: Gates Fast Healthcare Interoperability Resources (FHIR) / EHRbase-dependent routes (patients, messaging). Redirects to `/teaching` when `CLINICAL_SERVICES_ENABLED` is false.
- **`<RequireFeature feature="teaching">`**: Gates feature-flagged routes. Shows a "not found" page when the user's organisation does not have the feature enabled.

## Input validation and injection prevention

### Pydantic schema hardening

All data sent to the API is validated before processing, rejecting anything unexpected or malformed.

- All request schemas use `model_config = ConfigDict(extra="forbid")` to reject unexpected fields (prevents mass assignment attacks, where an attacker sends extra fields to modify data they should not be able to change).
- Email fields use `EmailStr` (Pydantic + `email-validator`) for RFC-compliant validation.
- Password minimum length standardised to 8 characters across all endpoints (aligned with National Institute of Standards and Technology (NIST) Special Publication (SP) 800-63B).

### Structured query language (SQL) injection

SQL injection is an attack where malicious database commands are inserted into user input fields. All database queries use **SQLAlchemy object-relational mapper (ORM)** with parameterised queries — no string concatenation. This means user input is always treated as data, never as executable commands. FHIR queries use object-based construction via the `fhirclient` library.

### Cross-site scripting (XSS) prevention

XSS attacks inject malicious scripts into web pages viewed by other users. The platform prevents this at multiple layers:

- **Backend (email)**: `nh3.clean()` sanitises Markdown-to-HTML output in email templates.
- **Frontend (rendering)**: `DOMPurify` sanitises all Markdown content before rendering, with an allowlist of safe tags and attributes. Only `http`, `https`, `mailto`, `tel`, relative, and `#` URLs are permitted.
- **Infrastructure**: Content Security Policy (CSP) (`script-src 'self'`) blocks inline scripts — only scripts from the application's own domain are allowed to run.

### Server-side request forgery (SSRF) and command injection

SSRF attacks trick the server into making requests to unintended destinations. No user-controllable URLs are used for server-side requests. FHIR and EHRbase service URLs are configured via environment variables, not user input.

## Infrastructure security

### Hypertext transfer protocol (HTTP) security headers

Security headers are instructions sent by the server that tell the browser how to behave when handling the site's content. Enforced by the Caddy reverse proxy on all responses:

| Header                      | Value                                                                                                                                                                                       | Purpose                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (2 years)                                                                                                                                    | Forces browsers to always use HTTPS                             |
| `Content-Security-Policy`   | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://storage.googleapis.com; font-src 'self'; connect-src 'self'; frame-ancestors 'none'` | Controls which resources the browser is allowed to load         |
| `X-Frame-Options`           | `DENY`                                                                                                                                                                                      | Prevents the site from being embedded in iframes (clickjacking) |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                   | Prevents the browser from guessing file types                   |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                           | Limits what URL information is shared with other sites          |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`                                                                                                                                                  | Blocks access to device features the app does not need          |
| `Server`                    | Removed                                                                                                                                                                                     | Hides server software details from potential attackers          |

### Transport Layer Security (TLS)

TLS encrypts all data in transit between the user's browser and the server, preventing eavesdropping. TLS termination (where encrypted traffic is decrypted) is handled by the **GCP Global HTTPS Load Balancer** with a Google-managed certificate. The Caddy container listens on port 80 behind the load balancer. HTTP Strict Transport Security (HSTS) with preload ensures browsers always use HTTPS.

### Docker security

Docker containers package the application and its dependencies into isolated units. The following measures harden these containers:

- **Non-root user**: Containers run as `appuser` (UID 10001), limiting the damage if a container is compromised.
- **Multi-stage builds**: Build dependencies (compilers, dev tools) are not included in production images, reducing the attack surface.
- **Base images**: Slim/Alpine variants, digest-pinned for reproducibility (each image is locked to an exact version).
- **Network isolation**: Backend and databases are on a `private` network not exposed to the host. Only the Caddy/frontend container is on the `public` network.

### Secrets management

Secrets (passwords, API keys, signing keys) require special handling to prevent accidental exposure.

- All secrets are typed as `SecretStr` (Pydantic) — a special type that masks the value when printed or logged, displaying `**********` instead of the actual secret.
- `.env` files are in `.gitignore` — never committed to version control.
- Production secrets are managed via **GCP Secret Manager** and injected as environment variables by Cloud Run.
- `JWT_SECRET` enforces `min_length=32` at startup.

### Cross-origin resource sharing (CORS)

CORS controls which websites are allowed to make requests to the API. Without it, any website could make requests on behalf of a logged-in user.

- Development: `["*"]` (permissive for local development).
- Production: Explicitly configured via `CORS_ORIGINS` environment variable in Cloud Run.

## Frontend security

### API client

The centralised API client (`frontend/src/lib/api.ts`) enforces security patterns automatically so that individual developers do not need to remember to add them:

- **Credentials**: All requests use `credentials: "include"` to send authentication cookies.
- **CSRF**: Automatically extracts the `XSRF-TOKEN` cookie and includes it as `X-CSRF-Token` header on all mutating requests.
- **Auto-refresh**: On 401 "unauthorised" response, silently requests a new access token and retries once. If refresh fails, redirects to `/login`.
- **No raw fetch**: All components use this client — raw `fetch` is prohibited by convention.

### Markdown rendering

The `MarkdownView` component uses DOMPurify with a strict allowlist to safely display user-authored content:

- Only specific HTML tags and attributes are permitted.
- URLs are validated against an allowlist of schemes (`http`, `https`, `mailto`, `tel`).
- Script injection via Markdown is blocked.

## CI/CD security pipeline

CI/CD (continuous integration / continuous deployment) automates the process of testing and deploying code changes. The security pipeline runs automated checks at every stage.

### Static analysis

Static analysis tools examine the source code without running it, catching potential vulnerabilities early:

| Tool              | Scope                                                                       | Trigger                                |
| ----------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| **Bandit**        | Python security linting (backend, excluding tests)                          | Pre-commit hook on every commit        |
| **Gitleaks**      | Detects accidentally committed secrets (API keys, tokens, passwords)        | Pre-commit hook on every commit        |
| **Semgrep**       | JavaScript/TypeScript security rules (frontend)                             | CI pipeline on every pull request (PR) |
| **Ruff**          | Python linting rules including security-relevant checks (E, F, W, I, UP, B) | Pre-commit hook                        |
| **mypy --strict** | Type safety — catches type confusion and null safety issues                 | Pre-commit hook and CI                 |

### Dependency scanning

Third-party libraries can contain known vulnerabilities. Dependency scanning tools monitor for these and alert the team:

| Tool           | Scope                                                                | Frequency                                                                                               |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Dependabot** | Vulnerability alerts for pip, npm, Docker, Terraform, GitHub Actions | Weekly scan against `main` and `clinical-live`                                                          |
| **Renovate**   | Version-bump PRs with 3-tier severity policy                         | Continuous; critical/high Common Vulnerabilities and Exposures (CVEs) trigger immediate hotfix branches |

### Penetration testing

Penetration testing simulates real-world attacks to verify defences hold. Automated security regression tests run monthly (and on-demand) via `.github/workflows/security-pentest.yml`:

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

### Secret scanning

Secret scanning prevents credentials from being committed to the repository, catching mistakes before they become security incidents.

- **Pre-commit (gitleaks)**: Scans staged changes for over 150 secret patterns (API keys, tokens, passwords, private keys) before each commit. If a secret is detected, the commit is blocked and the developer is alerted.
- **GitHub secret scanning**: Server-side scanning of the full repository history. Enabled via Terraform (`infra/github/security.tf`).
- **Push protection**: Blocks pushes containing detected secrets at the GitHub server level — even if the pre-commit hook is bypassed, the secret cannot reach the remote repository.

### Recommended improvements

| Priority | Item                            | Status                                    |
| -------- | ------------------------------- | ----------------------------------------- |
| Medium   | Migrate `python-jose` → `PyJWT` | Pending (eliminates ecdsa CVE-2024-23342) |
| Low      | Encrypt TOTP secrets at rest    | Under consideration                       |

## Healthcare-specific controls

### Protected health information (PHI) protection

PHI is any information that could identify a patient or relate to their health, treatment, or payment. It requires strict handling under healthcare regulations.

- **No PHI in logs**: Logging captures request method, path, status, and timing — never patient data or credentials.
- **No PHI in error messages**: Error responses contain generic messages, not database contents.
- **Audit trail**: All clinical document modifications are tracked via EHRbase's built-in versioning.

### Clinical data integrity

- **Three-database architecture**: Authentication (PostgreSQL), demographics (HAPI FHIR), and clinical documents (EHRbase) are isolated — a breach of one does not compromise all data.
- **FHIR compliance**: Patient demographics use the Health Level 7 (HL7) FHIR standard for interoperability and validation.
- **OpenEHR compliance**: Clinical letters and documents follow the OpenEHR archetype model with immutable versioning (once written, documents cannot be altered — only new versions can be created).
- **Idempotent operations**: Critical clinical operations use the `get_or_create_ehr` pattern to prevent duplicate records. An idempotent operation produces the same result whether it is run once or many times, which is essential for safety when network requests may be retried.
