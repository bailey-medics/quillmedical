# Hazard

**Hazard id:** Hazard-0044

**Hazard name:** Overly permissive CORS configuration

**Description:** If Caddyfile configures CORS headers with wildcard Access-Control-Allow-Origin (\*), malicious websites can make authenticated API requests using victim's cookies.

**Causes:**

- Access-Control-Allow-Origin set to wildcard "\*"
- No credentials=true validation
- Allows malicious site to make cross-origin requests with authentication

**Effect:**
Attacker-controlled website can make API requests to backend using victim clinician's browser cookies, bypassing CSRF protection.

**Hazard:**
CSRF attacks succeed despite CSRF token protection, allowing forged clinical actions (create letter, edit demographics, modify records).

**Hazard controls:**

### Design controls (manufacturer)

- Configure CORS with explicit origin allowlist: header Access-Control-Allow-Origin "https://quillmedical.com" in Caddyfile. Never use wildcard "\*". Only allow requests from known frontend domains. For multi-tenant deployments, maintain allowlist of clinic-specific domains.
- Disable credentials for CORS requests: header Access-Control-Allow-Credentials "false". Prevents malicious sites from including authentication cookies in cross-origin requests. Note: This changes authentication flow - consider token-based auth instead of cookies for cross-origin scenarios.
- Implement SameSite cookie attribute: set SameSite=Strict for authentication cookies. Prevents cookies from being sent in cross-origin requests even if CORS allows request. Provides defense-in-depth against CSRF. Update cookie setting: Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict.
- Add Content-Security-Policy header: CSP: "default-src 'self'". Prevents malicious scripts from making cross-origin requests even if CORS misconfigured. Whitelist only trusted domains for script-src, connect-src directives.
- Implement request origin validation in backend: middleware checks Origin or Referer header matches expected frontend domain. Reject requests from unexpected origins with 403 Forbidden. Provides server-side CORS enforcement (doesn't rely only on browser CORS mechanism).

### Testing controls (manufacturer)

- CORS test: Create test page at https://attacker.com that attempts to fetch https://quillmedical.com/api/patients with credentials. Assert browser blocks request with CORS error (Access-Control-Allow-Origin doesn't include attacker.com).
- Wildcard test: Temporarily set Access-Control-Allow-Origin to "\*" in test environment. Attempt cross-origin authenticated request. Verify browser blocks request when credentials=true (browser enforces: wildcard not allowed with credentials).
- SameSite test: Set authentication cookie with SameSite=Strict. Navigate to attacker-controlled page that embeds iframe to https://quillmedical.com/api/patients. Assert cookie not sent with iframe request (SameSite=Strict prevents cross-site cookie usage).
- CSP test: Load frontend, open browser devtools console. Attempt to execute fetch('https://attacker.com/api') from console. Assert browser blocks request with CSP violation error.
- Origin validation test: Send POST /api/patients request with Origin: https://attacker.com header. Assert backend returns 403 Forbidden with error "Invalid request origin."

### Training controls (deployment)

- Train developers on CORS security: explain wildcard origin risks, requirement for explicit origin allowlist, SameSite cookie attribute, defense-in-depth with CSP and server-side origin validation.
- Document CORS configuration: explain allowed origins, why wildcard prohibited, how to add new trusted domains to allowlist.

### Business process controls (deployment)

- Configuration review policy: All Caddyfile CORS changes reviewed by security team. Check for wildcard origins, missing SameSite attributes, overly permissive allow-credentials. Reject pull requests with insecure CORS configuration.
- Security testing: Quarterly security scan checks for CORS misconfigurations. Automated test attempts cross-origin request from untrusted domain. Verify request blocked. Alert if misconfiguration detected.
- Allowlist management: Security team maintains CORS origin allowlist. New origins added only after security review verifying domain ownership. Review allowlist quarterly, remove unused domains.
- Incident response: If CORS misconfiguration discovered (e.g., wildcard origin in production), immediately fix configuration and redeploy. Audit backend logs for cross-origin requests during misconfiguration period. Assess potential CSRF attacks. Notify affected users if evidence of exploitation found.

**Hazard types:**

- DataBreach
- CorruptedData

**Harm:**
False clinical information entered into medical records through forged requests. Incorrect treatment decisions based on falsified data causing patient harm.

**Code associated with hazard:**

- `caddy/dev/Caddyfile`
