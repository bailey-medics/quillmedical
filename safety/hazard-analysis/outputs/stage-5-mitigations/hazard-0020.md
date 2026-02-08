# Hazard

**Hazard id:** Hazard-0020

**Hazard name:** No rate limiting on login endpoint

**Description:** Login endpoint `/api/auth/login` has no rate limiting, failed login attempt tracking, or account lockout mechanisms, allowing unlimited brute force password attacks.

**Causes:**

- No rate limiting middleware installed on login route
- No failed login attempt counter per account
- No account lockout after N failed attempts
- No CAPTCHA or similar anti-automation protection

**Effect:**
Attacker can attempt thousands of password guesses per minute against clinician accounts.

**Hazard:**
Unauthorized access to clinician account with patient data access after successful brute force of weak password.

**Hazard controls:**

### Design controls (manufacturer)

- Install slowapi rate limiting middleware on /api/auth/login endpoint: limit 5 attempts per minute per IP address, 10 attempts per hour per username. Return 429 Too Many Requests with Retry-After header when limit exceeded.
- Implement progressive delay after failed attempts: 0s delay after 1st failed login, 2s after 2nd, 5s after 3rd, 15s after 4th, 60s after 5th and subsequent attempts. Makes brute force computationally expensive.
- Add account lockout: after 5 failed login attempts within 15 minutes, lock account for 30 minutes. Send email notification to account owner about lockout with unlock link (requires email verification).
- Implement CAPTCHA on login form after 3 failed attempts: use hCaptcha or reCAPTCHA v3 to verify human user. Prevents automated brute force scripts.
- Log all failed login attempts with IP address, timestamp, username to security audit log. Alert security team if >50 failed attempts from single IP within 1 hour (potential attack in progress).

### Testing controls (manufacturer)

- Integration test: Make 6 POST requests to /api/auth/login with wrong password from same IP. Assert 6th request returns 429 Too Many Requests error. Verify Retry-After header indicates 60-second delay.
- Integration test: Attempt 5 failed logins with username "testuser", verify 6th attempt returns "Account locked" error. Wait 30 minutes (or mock time advance), verify 6th attempt now processed.
- Load test: Launch 1000 concurrent login requests from different IPs with invalid credentials. Assert rate limiting applies per IP, not global limit. Verify no DoS condition created.
- Unit test: Simulate progressive delay algorithm, verify delay increases exponentially after each failed attempt: 0s, 2s, 5s, 15s, 60s pattern.

### Training controls (deployment)

- Train staff on strong password requirements: minimum 12 characters, mix of uppercase, lowercase, numbers, symbols. Provide password manager training (1Password, LastPass, Bitwarden).
- Document password policy: Passwords must not be dictionary words, personal information, or common patterns. Enable password strength meter in registration form.
- Include in security awareness training: Account lockout is security feature, not system fault. Contact IT if legitimate lockout occurs due to forgotten password.

### Business process controls (deployment)

- NHS Trust IT security policy: All clinical system accounts must use passwords meeting NHS Digital guidance (12+ characters, complexity requirements, 90-day rotation).
- Incident response: If >100 failed logins detected from single IP, automatically block IP at firewall level pending security review.
- Security audit: Monthly review of failed login attempts by account and IP. Identify compromised accounts, patterns of attack, effectiveness of rate limiting.
- Policy requirement: Two-factor authentication (TOTP) mandatory for all clinician accounts. Administrator accounts require hardware token (YubiKey) for login.

**Harm:**
Data breach with unauthorized viewing of patient records. Attacker could modify patient records causing clinical harm.

**Code associated with hazard:**

- `backend/app/main.py:220-290`
