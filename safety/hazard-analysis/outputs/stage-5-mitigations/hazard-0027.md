# Hazard

**Hazard id:** Hazard-0027

**Hazard name:** JWT secret reuse for CSRF tokens

**Description:** CSRF token signing uses same JWT_SECRET as JWT tokens, increasing attack surface where single secret compromise breaks both authentication and CSRF protection mechanisms.

**Causes:**

- make_csrf and verify_csrf functions use settings.JWT_SECRET for signing
- Same secret used for two different security mechanisms
- If JWT secret compromised (logs, config dump, environment variable exposure), both protections fail

**Effect:**
Single secret compromise breaks both JWT authentication and CSRF protection simultaneously.

**Hazard:**
Attacker can forge both JWT authentication tokens and CSRF tokens, bypassing all authentication and request forgery protections.

**Hazard controls:**

### Design controls (manufacturer)

- Create separate CSRF_SECRET environment variable independent of JWT_SECRET. Use different 64+ character random strings for each secret. Update make_csrf and verify_csrf to use CSRF_SECRET.
- Implement secret rotation policy: JWT_SECRET and CSRF_SECRET must be rotated every 90 days. Document rotation procedure: generate new secret, update environment variable, deploy without downtime (grace period allows both old and new secrets).
- Store secrets in dedicated secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) instead of environment variables. Retrieve secrets at application startup from secure vault.
- Implement secret validation at startup: verify JWT_SECRET and CSRF_SECRET are different values, minimum 32 characters each, high entropy (not dictionary words). Fail to start if secrets weak or identical.
- Add secret leak detection: monitor application logs and error outputs for accidental secret exposure. Use secret scanning tools (GitGuardian, TruffleHog) in CI/CD pipeline.

### Testing controls (manufacturer)

- Unit test: Verify JWT_SECRET and CSRF_SECRET loaded from different environment variables. Assert values are different, assert minimum length 32 characters.
- Integration test: Generate CSRF token, attempt to use JWT_SECRET to verify. Assert verification fails (demonstrates secrets are independent).
- Security test: Simulate JWT_SECRET compromise scenario - generate valid JWT using compromised secret, attempt to generate CSRF token with same secret. Verify CSRF token invalid (uses different secret).
- Startup test: Set JWT_SECRET = CSRF_SECRET in test environment. Assert application fails to start with error message "JWT_SECRET and CSRF_SECRET must be different values."

### Training controls (deployment)

- Train developers on secret management best practices: separate secrets for different purposes, never commit secrets to git, use secrets manager.
- Document secret rotation procedure for operations team: step-by-step guide for rotating JWT and CSRF secrets in production without downtime.

### Business process controls (deployment)

- IT security policy: Secrets used for different security purposes must be unique. No secret reuse across mechanisms.
- Secret rotation schedule: JWT_SECRET and CSRF_SECRET rotated every 90 days. Mark rotation dates in operations calendar.
- Incident response: If secret compromise suspected, immediately rotate affected secret. Audit logs for unauthorized access in period before rotation.
- Audit requirement: Quarterly security review verifying secrets stored in secrets manager (not environment variables or config files), minimum complexity requirements met, rotation schedule followed.

**Harm:**
Complete system compromise with unauthorized access to all patient data. Attacker can forge clinical actions (create letters, edit demographics, modify records) causing patient harm through falsified clinical information.

**Code associated with hazard:**

- `backend/app/security.py:152-178`
