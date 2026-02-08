# Hazard

**Hazard id:** Hazard-0029

**Hazard name:** New user accounts active by default

**Description:** User model sets is_active=True by default, allowing newly registered accounts to immediately access system without email verification or admin approval.

**Causes:**

- Column default is True in database schema
- No email verification step in registration flow
- No admin approval workflow before account activation

**Effect:**
Attacker can self-register via registration endpoint (if open) and immediately access patient data without any verification or approval process.

**Hazard:**
Unauthorized users access clinical system with full read/write access to patient records.

**Hazard controls:**

### Design controls (manufacturer)

- Change is_active default to False in User model. Add account_status enum column with states: PENDING_VERIFICATION, PENDING_APPROVAL, ACTIVE, SUSPENDED, DEACTIVATED. New registrations start in PENDING_VERIFICATION state.
- Implement email verification workflow: generate cryptographically secure verification token (32 bytes from secrets.token_urlsafe), store token hash in database with expiry timestamp (24 hours). Send verification email with link containing token. Create /api/auth/verify-email/{token} endpoint that validates token and transitions account_status to PENDING_APPROVAL.
- Add administrator approval workflow: after email verification, administrator dashboard shows pending accounts. Administrator reviews account details (name, email, requested role, registration timestamp) and clicks Approve or Reject. Approval transitions account_status to ACTIVE, rejection sends rejection email and deletes account.
- Implement role-based access control for registration: registration endpoint requires existing admin user to generate invitation code. Registration form requires valid invitation code (single-use, expires after 7 days). Prevents open self-registration.
- Add automated checks during registration: validate email domain against whitelist of approved NHS trust domains (@nhs.uk, @\*.nhs.uk). Block disposable email domains (mailinator.com, 10minutemail.com). Use email verification service API to check email deliverability before sending verification email.

### Testing controls (manufacturer)

- Unit test: Create new user via register endpoint. Query database for is_active value. Assert is_active=False and account_status=PENDING_VERIFICATION.
- Integration test: Register account, call protected API endpoint before email verification. Assert 403 Forbidden with error message "Account pending email verification."
- End-to-end test: Complete full registration workflow: register → receive email → click verification link → admin approves → login succeeds. Assert login fails before approval step.
- Security test: Attempt to register with disposable email domain (e.g., mailinator.com). Assert registration rejected with error "Email domain not allowed."
- Load test: Register 100 accounts, verify none can access system before admin approval. Measure admin approval processing time (target: <30 seconds per account).

### Training controls (deployment)

- Train administrators on account approval workflow: review registration requests daily, check email domain legitimacy, verify requester identity against staff directory, approve only authorized clinical staff.
- Document approval criteria: email domain must match NHS trust domain, requestor name matches staff directory, role request matches job title. Escalate suspicious registrations to IT security.

### Business process controls (deployment)

- Account approval policy: All new accounts require administrator approval within 24 hours of email verification. Approval logged in audit trail with approver identity, approval timestamp, approval decision.
- Email domain whitelist: Maintain list of approved NHS trust email domains. Update whitelist when new trusts onboard. Review whitelist quarterly for outdated domains.
- Registration monitoring: Security team reviews registration logs weekly for suspicious patterns (multiple registrations from same IP, registrations outside business hours, rejected registrations). Investigate anomalies as potential attack attempts.
- Invitation code policy: For high-security deployments, disable open registration. Issue invitation codes only to verified staff members. Track invitation code usage: who issued code, who used code, when used.

**Hazard types:**

- DataBreach

**Harm:**
Data breach with unauthorized viewing/editing of patient records. GDPR violation. Potential patient harm if attacker modifies clinical records causing incorrect treatment decisions.

**Code associated with hazard:**

- `backend/app/models.py`
