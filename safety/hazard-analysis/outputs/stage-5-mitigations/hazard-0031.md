# Hazard

**Hazard id:** Hazard-0031

**Hazard name:** No email verification on registration

**Description:** User registration endpoint creates account immediately without email confirmation, allowing attackers to register with fake emails and gain immediate system access.

**Causes:**

- No verification token sent to email after registration
- No "pending verification" account state
- Account usable immediately after registration API call completes

**Effect:**
Attacker can register with fake or disposable email address and immediately access clinical system.

**Hazard:**
Unauthorized users access clinical data without any verification that they are legitimate clinicians or authorized personnel.

**Hazard controls:**

### Design controls (manufacturer)

- Implement email verification workflow: after registration, generate cryptographically secure verification token (32 bytes from secrets.token_urlsafe). Store token hash (SHA-256) in email_verification_tokens table with columns: user_id, token_hash, expires_at (24 hours from creation), created_at. Send verification email with link: <https://quillmedical.com/verify-email?token={token}>.
- Create /api/auth/verify-email endpoint: accepts token parameter, looks up token hash in database, validates expiry, transitions user.is_active from False to True, deletes verification token. Return success message with redirect to login page.
- Add account_status enum to User model: PENDING_VERIFICATION, ACTIVE, SUSPENDED. New registrations start in PENDING_VERIFICATION state. Login endpoint checks account_status, returns 403 if not ACTIVE with message "Please verify your email address."
- Implement resend verification email endpoint: /api/auth/resend-verification-email. Rate limited to 3 requests per hour per email address. Generates new verification token (invalidates old token), sends new verification email.
- Add email verification status to user profile API response: include email_verified boolean field. Frontend displays banner "Please verify your email" if email_verified=False, with "Resend verification email" button.

### Testing controls (manufacturer)

- Unit test: Register new user. Assert user.is_active=False, user.account_status=PENDING_VERIFICATION. Verify email_verification_tokens table contains entry for user with expires_at 24 hours in future.
- Integration test: Register user, attempt to login before email verification. Assert 403 Forbidden with error message "Please verify your email address."
- End-to-end test: Complete full workflow: register → receive email → extract token from email HTML → call /api/auth/verify-email with token → assert user.is_active=True → login succeeds.
- Token expiry test: Register user, wait 25 hours (or mock time), attempt to verify with expired token. Assert 400 Bad Request with error "Verification link expired. Please request a new one."
- Resend rate limit test: Call /api/auth/resend-verification-email 4 times in 1 hour for same email. Assert 4th request returns 429 Too Many Requests.

### Training controls (deployment)

- Train users on email verification requirement: after registration, check email inbox (including spam folder) for verification link, click link to activate account, contact support if email not received.
- Document troubleshooting steps for support team: if user reports not receiving verification email, check email deliverability, verify email address spelling, manually resend verification email from admin panel.

### Business process controls (deployment)

- Email verification policy: All new accounts require email verification within 24 hours. Accounts not verified within 7 days automatically deleted (cleanup job).
- Email deliverability monitoring: Track verification email delivery rates (target: >98% delivered). Investigate delivery failures (bounces, spam filtering). Maintain email sender reputation (SPF, DKIM, DMARC configured).
- Suspicious registration monitoring: Security team reviews registrations with unverified emails >48 hours old. Investigate patterns suggesting automated registration attacks (same IP, sequential emails, disposable domains).
- Support escalation: If user cannot receive verification email after multiple attempts (including different email addresses), support can manually verify account with approval from IT security manager. Manual verification logged in audit trail.

**Hazard types:**

- DataBreach

**Harm:**
Data breach with unauthorized viewing of patient records. GDPR violation. Potential patient harm if attacker modifies clinical records causing incorrect treatment decisions.

**Code associated with hazard:**

- `backend/app/schemas/auth.py`
- `backend/app/main.py:255-290`
