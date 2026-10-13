# Cybersecurity implementations

Technical overview of the security controls implemented across the Quill Medical platform. This document covers authentication (verifying who a user is), authorisation (controlling what they can do), infrastructure hardening, input validation, frontend protections, and continuous integration / continuous deployment (CI/CD) security tooling.

For the detailed audit findings and penetration test results, see the [Security review plan](../plans/2026-04-04-security-review.md).

## Authentication

### Password hashing

Hashing is a one-way mathematical transformation - the original password cannot be recovered from the stored hash. Passwords are hashed with **Argon2id** (via `argon2-cffi`) using Open Worldwide Application Security Project (OWASP) recommended defaults:

| Parameter   | Value          |
| ----------- | -------------- |
| Algorithm   | Argon2id       |
| time_cost   | 3              |
| memory_cost | 65536 (64 MiB) |
| parallelism | 4              |

Passwords are never stored in plain text. Verification uses constant-time comparison to prevent timing attacks (where an attacker measures response speed to guess correct characters).

### JSON web token (JWT) tokens

All authentication tokens are signed JWTs - compact, digitally signed tokens that prove a user's identity without requiring a database lookup on every request. They use **HS256** (HMAC with SHA-256) with a minimum 32-character secret (enforced by Pydantic `min_length=32`).

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
- `SECURE_COOKIES` defaults to `false` in development, explicitly set to `true` in production by Terraform, in `infra/main.tf`.
- `COOKIE_DOMAIN` is configurable per environment, and deliberately unset in every deployed one. Unset means host-only: a cookie set by `app.quill-medical.com` is never sent to another subdomain of `quill-medical.com`. `backend/tests/auth_cookies_are_host_only_test.py` pins this.
- **Not yet done: the `__Host-` and `__Secure-` name prefixes.** A cookie named `__Host-…` is refused by the browser unless it is host-only, `Secure` and `Path=/`, so the rules above become enforced rather than merely configured. `access_token` and `XSRF-TOKEN` qualify. `refresh_token` does not, because its path is `/api/auth/refresh`, so it would take `__Secure-`, which enforces `Secure` only. Renaming a cookie logs everyone out once and needs the frontend's CSRF reader changed in step, which is why it is listed under recommended improvements below rather than done alongside host-only.

### Cross-site request forgery (CSRF) protection

CSRF attacks trick a user's browser into making unwanted requests to a site where they are already logged in. State-changing requests (POST, PUT, PATCH, DELETE) are protected by the **double-submit cookie** pattern:

1. On login, the server sets a signed `XSRF-TOKEN` cookie (readable by JavaScript).
2. The frontend API client extracts this value and includes it as an `X-CSRF-Token` header on every mutating request.
3. The backend `require_csrf` dependency verifies the header token matches the cookie and is signed for the correct user.
4. Token signing uses `itsdangerous.URLSafeSerializer` with the JWT secret and a `csrf` salt.

This works because an attacker's website can trigger a request that includes the cookie, but cannot read the cookie value to include it in the header.

The check is not left to each route to remember. `backend/tests/every_route_is_guarded_test.py` walks every route the application serves and fails the build if one that changes something for a signed-in caller does not take the CSRF dependency. There is no list of exceptions.

### Two-factor authentication (2FA) - time-based one-time password (TOTP)

2FA adds an extra layer of security beyond a password. TOTP generates a short-lived code (typically six digits) using an authenticator app on the user's phone.

- **Standard**: RFC 6238 (TOTP), 30-second time steps, no clock drift tolerance (only the current step is accepted).
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

In production, **Google Cloud Platform (GCP) Cloud Armor** provides additional global rate limiting at the load balancer level: 500 requests a minute per IP address. That one rule is all the policy holds. It has no rules that look for attack patterns, so it is not a web application firewall.

### Anti-enumeration

Anti-enumeration prevents attackers from discovering valid usernames or email addresses by observing differences in error messages or response behaviour.

- **Login**: Returns a generic "Invalid credentials" message regardless of whether the username exists.
- **Registration**: Returns "Username or email already in use" for both duplicate username and duplicate email (no field-specific error).
- **Forgot password**: Always returns `{"detail": "ok"}` - does not reveal whether the email is registered.
- **Conversation access**: Returns 404 "not found" (not 403 "forbidden") for unauthorised conversation access, preventing insecure direct object reference (IDOR) enumeration.

## Authorisation

### Platform role

One question, with one value and its absence: does this person operate Quill
itself?

```
standard | superadmin
```

- `platform_role` is read directly - there is no hierarchy and no ordering, so
  nothing can sit "above" anything else.
- It confers **no clinical access**. A superadmin who does not hold
  `access_patient_records` cannot read a record, the same as anyone else.
- It scopes what an administrator reaches: routes acting at a place check
  membership, and an operator skips that check because they are global.
- Administering users is the `manage_users` competency, paired with a place
  check on every route that carries it.

This replaced a four-level `system_permissions` column
(`single-user < staff < admin < superadmin`) which held two unrelated ideas at
once. Three of its rungs described a person _somewhere_ and became organisation
and site membership plus competencies; only `superadmin` stood alone. See
`docs/docs/plans/2026-09-09-platform-role-plan.md`.

### Competency-based access control (CBAC)

Healthcare-specific authorisation layer for clinical operations. Rather than simple role-based permissions, CBAC checks whether a user has a specific clinical competency (e.g. "can prescribe controlled drugs") before allowing an action.

- **Competency resolution**: `final_competencies = base_profession_competencies + additional_competencies - removed_competencies`
- **Configuration**: Defined in `shared/competency-definitions/` (a directory split by kind - `clinical.yaml` for what may be done to a patient, `admin.yaml` for administering a place, and feature files such as `teaching.yaml` and `passport.yaml` - merged into one catalogue at load time) and `shared/base-professions.yaml` (profession templates).
- **Enforcement**: `has_competency("competency_id")` FastAPI dependency - raises 403 if the user lacks the required competency.
- **Self-modification blocked**: Only a superadmin (platform role) can modify their own competencies via `PATCH /cbac/my-competencies`; everyone else is changed by a holder of `manage_users` through `PATCH /users/{user_id}`.

### Route protection (frontend)

These components wrap pages to control who can see them:

- **`<RequireAuth>`**: Redirects unauthenticated users to `/login`.
- **`<GuestOnly>`**: Redirects authenticated users away from login/register pages.
- **`<RequireOperator>`** and **`<RequireCompetency competency="manage_users">`**: Gate operator and competency-gated routes client-side. Anyone without the platform role or the competency sees a "not found" page (feature hiding). The backend always re-validates.
- **`<RequireClinical>`**: Gates Fast Healthcare Interoperability Resources (FHIR) / EHRbase-dependent routes (patients, messaging). Redirects to `/` when `CLINICAL_SERVICES_ENABLED` is false.
- **`<RequireFeature feature="teaching">`**: Gates feature-flagged routes. Shows a "not found" page when the user's organisation does not have the feature enabled.

## Input validation and injection prevention

### Every route asks who is calling

A route with no guard is open to anybody who can reach the server, and nothing about it looks wrong: it works and its tests pass. So one test, `backend/tests/every_route_is_guarded_test.py`, walks every route the application serves, wherever it is written, and looks in its dependencies for the function that settles who the caller is. A route without one must be named in that test's `PUBLIC` list with the reason it is open. The list fails the build in both directions: a new unguarded route fails until it is guarded or listed, and an entry whose route has since been guarded or removed fails until it is taken out.

### Pydantic schema hardening

All data sent to the API is validated before processing, rejecting anything unexpected or malformed.

- **Unexpected fields are refused.** Every model a request body is read into sets `model_config = ConfigDict(extra="forbid")`. This prevents mass assignment attacks, where an attacker sends extra fields to modify data they should not be able to change. `backend/tests/every_request_model_forbids_extra_test.py` walks every route and fails on a model that does not, with no exceptions.
- **A request body is capped at one megabyte**, by `backend/app/body_limit.py`. The four routes that take a file each have a larger limit of their own. The `Content-Length` header is read first, and the bytes are then counted as they arrive, so a request that leaves the header out or lies in it is stopped at the limit too.
- **The fields that matter most have a length limit of their own**: passwords (128 characters), usernames (150), full names and email addresses (255), emailed tokens (2,048) and one-time codes (16). The limits are in `backend/app/schemas/limits.py`, and `backend/tests/request_fields_have_limits_test.py` holds every request model to them by the field's name. The frontend's inputs stop at the same numbers.
- Email fields use `EmailStr` (Pydantic + `email-validator`) for RFC-compliant validation.
- Password minimum length standardised to 8 characters across all endpoints (aligned with National Institute of Standards and Technology (NIST) Special Publication (SP) 800-63B).

### Structured query language (SQL) injection

SQL injection is an attack where malicious database commands are inserted into user input fields. All database queries use **SQLAlchemy object-relational mapper (ORM)** with parameterised queries - no string concatenation. This means user input is always treated as data, never as executable commands. FHIR queries use object-based construction via the `fhirclient` library.

### Cross-site scripting (XSS) prevention

XSS attacks inject malicious scripts into web pages viewed by other users. The platform prevents this at multiple layers:

- **Backend (email)**: `nh3.clean()` sanitises Markdown-to-HTML output in email templates.
- **Frontend (rendering)**: `DOMPurify` sanitises all Markdown content before rendering, with an allowlist of safe tags and attributes. Only `http`, `https`, `mailto`, `tel`, relative, and `#` URLs are permitted.
- **Infrastructure**: Content Security Policy (CSP) (`script-src 'self'`) blocks inline scripts - only scripts from the application's own domain are allowed to run.

### Server-side request forgery (SSRF) and command injection

SSRF attacks trick the server into making requests to unintended destinations. FHIR and EHRbase service URLs are configured via environment variables, not user input.

One address does come from a user: the endpoint in a Web Push subscription, which the server later sends each notification to. It is checked when it is stored, in `backend/app/push.py`. It must be `https`, on port 443, with no user name, written only in plain address characters, and its host must be a plain host name belonging to one of the push services browsers use (Google, Mozilla, Apple or Microsoft). The host is checked strictly because the check and the client that sends the notification have to agree on where the host ends, and two parsers can read an unusual address differently. A test asks the sending client's own parser to confirm it agrees for every address the check lets through.

## Infrastructure security

### Hypertext transfer protocol (HTTP) security headers

Security headers are instructions sent by the server that tell the browser how to behave when handling the site's content. Set by Caddy on every response it serves, which in production is the application's pages and static files. See [Which layer sets the headers](#which-layer-sets-the-headers) for the rest:

| Header                      | Value                                                                                                                                                                                                                                                                | Purpose                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (2 years)                                                                                                                                                                                                                      | Forces browsers to always use HTTPS                             |
| `Content-Security-Policy`   | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://storage.googleapis.com; font-src 'self'; connect-src 'self' https://storage.googleapis.com; frame-src 'self' https://www.youtube.com; frame-ancestors 'none'` | Controls which resources the browser is allowed to load         |
| `X-Frame-Options`           | `DENY`                                                                                                                                                                                                                                                               | Prevents the site from being embedded in iframes (clickjacking) |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                                                                                            | Prevents the browser from guessing file types                   |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                    | Limits what URL information is shared with other sites          |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                                                                           | Blocks access to device features the app does not need          |
| `Server`                    | Removed                                                                                                                                                                                                                                                              | Hides server software details from potential attackers          |

### Which layer sets the headers

Caddy only sees the responses it serves, so in production three other kinds of response get their headers from the load balancer instead, through `custom_response_headers` in Terraform. The dev and end-to-end stacks have no load balancer. The end-to-end stack serves the application's pages through the production Caddyfile, so there only Caddy's headers exist; the dev stack's Caddyfile (`caddy/dev/Caddyfile`) sets none of them.

- **The application's pages and static files** - Caddy (`caddy/prod/Caddyfile`), with the values in the table above.
- **API responses, `/api/*`** - the load balancer's backend service (`infra/modules/load-balancer/main.tf`). `Content-Security-Policy` is `default-src 'none'; frame-ancestors 'self'`, far tighter than the application's because an API response should load nothing. `X-Frame-Options` is `SAMEORIGIN` rather than `DENY`, because the certificate page shows a PDF from the API in an iframe. `Strict-Transport-Security`, `X-Content-Type-Options` and `Referrer-Policy` match the table.
- **Teaching videos and captions, `/videos/*`** - the videos backend bucket (`infra/modules/teaching-video-pipeline/main.tf`). The same set as the API with `X-Frame-Options: DENY`, and no `Content-Security-Policy`, which does nothing on a media file.
- **The landing site** - its own backend bucket, in the load balancer module, with a policy written for that site.

The load balancer overwrites a header of the same name that the backend sent, so a single API route cannot set its own value for any of these.

After every deploy, `deploy.yml` requests `/` and `/api/health` on the live site and fails if `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` or `Strict-Transport-Security` is missing (`.github/scripts/deploy/check-security-headers.sh`).

### Transport Layer Security (TLS)

TLS encrypts all data in transit between the user's browser and the server, preventing eavesdropping. TLS termination (where encrypted traffic is decrypted) is handled by the **GCP Global HTTPS Load Balancer** with a Google-managed certificate. The Caddy container listens on port 8080 behind the load balancer. HTTP Strict Transport Security (HSTS) ensures browsers always use HTTPS.

### Docker security

Docker containers package the application and its dependencies into isolated units. The following measures harden these containers:

- **Non-root user**: Backend containers run as `appuser` (UID 10001) and the frontend container as `nobody`, limiting the damage if a container is compromised.
- **Multi-stage builds**: Build dependencies (compilers, dev tools) are not included in production images, reducing the attack surface.
- **Base images**: Slim/Alpine variants, digest-pinned for reproducibility (each image is locked to an exact version).
- **Network isolation**: The databases are on an internal `private` network not exposed to the host. The backend, FHIR and EHRbase containers join both networks; only Caddy and the frontend dev server publish ports to the host.

### Secrets management

Secrets (passwords, API keys, signing keys) require special handling to prevent accidental exposure.

- All secrets are typed as `SecretStr` (Pydantic) - a special type that masks the value when printed or logged, displaying `**********` instead of the actual secret.
- `.env` files are in `.gitignore` - never committed to version control.
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
- **No raw fetch**: All components use this client - raw `fetch` is prohibited by convention.

### Markdown rendering

The `MarkdownView` component uses DOMPurify with a strict allowlist to safely display user-authored content:

- Only specific HTML tags and attributes are permitted.
- URLs are validated against an allowlist of schemes (`http`, `https`, `mailto`, `tel`).
- Script injection via Markdown is blocked.

## CI/CD security pipeline

CI/CD (continuous integration / continuous deployment) automates the process of testing and deploying code changes. The security pipeline runs automated checks at every stage.

### Static analysis

Static analysis tools examine the source code without running it, catching potential vulnerabilities early:

- **Bandit** - Python security linting of the backend, excluding tests. Pre-commit hook on every commit.
- **Gitleaks** - detects committed secrets (API keys, tokens, passwords). Pre-commit hook on staged changes, and a `Secret scan` job in CI over every commit a branch adds.
- **Semgrep** - security rules kept in the repository, for the frontend (`frontend/.semgrep.yml`) and the backend (`backend/.semgrep.yml`). The backend rules cover what Bandit has no check for: a token read without checking its signature, `jwt.decode` with no list of algorithms, SQL built from strings, cookies missing their flags, CORS allowing any origin with credentials, a secret written to a log, and a signature compared with `==`. CI on every non-draft pull request (PR) and in the merge queue.
- **Ruff** - Python linting including security-relevant checks (E, F, W, I, UP, B). Pre-commit hook.
- **mypy --strict** - type safety, catching type confusion and null safety issues. Pre-commit hook and CI, run from `backend/` so that it reads the project's configuration and sees the real libraries.
- **ESLint, Prettier and stylelint** - over every frontend source file. Pre-commit hook and CI.

### Proving the checks are live

A check that scans nothing passes, and a green tick does not say which kind it is. In October 2026 five checks were found to have been passing while looking at little or nothing: a typo in an argument, a configuration file that replaced the rules it was meant to add to, a library upgrade that changed what a list held, a setting nothing read, and a file pattern that reached one folder down. Each was fixed, and each check now has to show that it worked:

- **A floor.** A check that reports how much it scanned is held to a minimum, so a wrong path fails the build. Bandit must report at least 10,000 lines, Semgrep at least 500 frontend files and 100 backend files, the frontend linters at least 500 files, strict mypy at least 100 files, the API schema check at least 100 routes, and the dependency audit at least 50 packages.
- **A canary.** A check that looks for a pattern is first given something it must find. The secret scan writes a made-up key into a scratch folder and fails without scanning if gitleaks does not report it. Each Semgrep rule has a line written to break it, and the job fails if any rule does not find its line.
- **A list that fails in both directions.** Where a test allows exceptions, an exception that is no longer needed fails the build too, so a list cannot drift from the code it describes.

### Dependency scanning

Third-party libraries can contain known vulnerabilities. Dependency scanning tools monitor for these and alert the team:

- **Dependency audit** - `.github/workflows/dependency-audit.yml` checks the packages the application ships: the backend's production packages with `pip-audit`, and the frontend's with `yarn npm audit`. It runs on any pull request that changes what is installed, every morning against `main` with a Slack message on failure, and on demand. An advisory that does not apply is excused by name with a written reason, and an excuse that no longer matches anything fails the audit.
- **Dependabot** - vulnerability alerts for pip, npm, Docker, Terraform and GitHub Actions. Weekly scan against `main`.
- **Renovate** - version-bump PRs with a 3-tier severity policy. Weekly, on Wednesdays; fixes for Common Vulnerabilities and Exposures (CVEs) skip the schedule and open immediately against `main`.

### Penetration testing

Penetration testing simulates real-world attacks to verify defences hold. Automated security regression tests run monthly (and on-demand) via `.github/workflows/security-pentest.yml`:

- **39 tests** in `backend/tests/security_pentest_test.py` covering:
  - Property-based crypto round-trips (Hypothesis, 50 to 200 examples each)
  - JWT manipulation attacks (alg:none, wrong secret, expired, tampered, stale token_version)
  - CSRF bypass attempts (missing header, forged token, cross-user token)
  - Authentication attacks (rate limiting, anti-enumeration, password policy)
  - Privilege escalation (user→admin, CBAC self-update)
  - Injection testing (SQL injection, XSS, extra fields, fuzz testing)
  - Cookie security and unauthenticated endpoint protection
- **Token behaviour**, in `backend/app/security_tokens_test.py`, which runs with the unit tests on every push: every kind of signed token the backend reads is offered expired, tampered with, signed with another secret, signed under another algorithm and with no signature at all. Each bad token is built by hand, so the tests do not depend on the library they are testing.
- **OWASP ZAP baseline scan** of the live application, weekly, via `.github/workflows/zap-scan.yml`. Findings are filed as GitHub issues.
- **Schedule**: 1st of each month at 03:00 UTC.
- **Artefacts**: JUnit XML results uploaded with 90-day retention.
- **Notifications**: Slack alert on both success and failure - the success "dead man's switch" ping confirms the infrequent monthly run actually executed, so silence is never mistaken for a pass.

### Secret scanning

Secret scanning prevents credentials from being committed to the repository, catching mistakes before they become security incidents.

- **Pre-commit (gitleaks)**: Scans staged changes for over 150 secret patterns (API keys, tokens, passwords, private keys) before each commit. If a secret is detected, the commit is blocked and the developer is alerted.
- **CI (gitleaks)**: The `Secret scan` job scans every commit a branch adds to `main`, so a commit made where the hook is not installed, or pushed with `--no-verify`, still meets the scan. It proves its rules fire before it scans, as described under "Proving the checks are live".
- **GitHub secret scanning**: Server-side scanning of the full repository history. Enabled via Terraform (`infra/github/security.tf`).
- **Push protection**: Blocks pushes containing detected secrets at the GitHub server level - even if the pre-commit hook is bypassed, the secret cannot reach the remote repository.

### Code audit

Code reaches `main` through its author and the automated checks above. An audit is a third pair of eyes after those two: somebody reads a file as it stands and stamps it. The stamps are kept in `audit/ledger.tsv`, each recording the file, a fingerprint of the exact version, the date and the auditor, so a file edited after its audit shows as changed. See [The audit ledger](../conventions/audit-ledger.md).

### Recommended improvements

| Priority | Item                                 | Status                                    |
| -------- | ------------------------------------ | ----------------------------------------- |
| Medium   | Migrate `python-jose` → `PyJWT`      | Done, 12 October 2026 (removes ecdsa CVE-2024-23342 and CVE-2026-85394; a token now says what kind it is and must carry an expiry) |
| Low      | Encrypt TOTP secrets at rest         | Under consideration                       |
| Low      | `__Host-` / `__Secure-` cookie names | Pending (see cookie configuration)        |

## Healthcare-specific controls

### Protected health information (PHI) protection

PHI is any information that could identify a patient or relate to their health, treatment, or payment. It requires strict handling under healthcare regulations.

- **No PHI in logs**: Logging captures request method, path, status, and timing - never patient data or credentials.
- **No PHI in error messages**: Error responses contain generic messages, not database contents.
- **Audit trail**: All clinical document modifications are tracked via EHRbase's built-in versioning.

### Clinical data integrity

- **Three-database architecture**: Authentication (PostgreSQL), demographics (HAPI FHIR), and clinical documents (EHRbase) are isolated - a breach of one does not compromise all data.
- **FHIR compliance**: Patient demographics use the Health Level 7 (HL7) FHIR standard for interoperability and validation.
- **OpenEHR compliance**: Clinical letters and documents follow the OpenEHR archetype model with immutable versioning (once written, documents cannot be altered - only new versions can be created).
- **Idempotent operations**: Critical clinical operations use the `get_or_create_ehr` pattern to prevent duplicate records. An idempotent operation produces the same result whether it is run once or many times, which is essential for safety when network requests may be retried.
