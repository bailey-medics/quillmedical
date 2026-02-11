# Hazard

**Hazard id:** Hazard-0024

**Hazard name:** TOTP validation insufficient on client side

**Description:** AuthContext.login validates TOTP code length client-side but accepts any 6-digit number including "000000", with actual cryptographic validation only on server-side, providing poor user experience for authentication failures.

**Causes:**

- Client-side validation only checks length, not format or validity
- User could submit invalid codes like "000000" or alphabet characters before server rejects
- Generic error messages on server rejection don't explain what went wrong

**Effect:**
Invalid TOTP submitted to server, user sees generic error message without specific guidance on what went wrong.

**Hazard:**
Clinician locked out of account during clinical emergency when TOTP repeatedly fails, cannot access patient records for immediate treatment decisions.

**Hazard controls:**

### Design controls (manufacturer)

- Add client-side TOTP code format validation: verify code is exactly 6 digits, all numeric characters, no spaces/dashes. Reject obvious invalid values like "000000", "111111", "123456" with message "Invalid code format."
- Improve error messages from server: distinguish between "Invalid TOTP code" (wrong code) vs "TOTP not enabled for account" vs "TOTP expired" vs "System clock out of sync." Return specific error_code in response.
- Add TOTP backup codes during setup: generate 10 single-use backup codes, display to user with instruction "Store these securely for emergency access if TOTP device lost." Codes bypass TOTP requirement.
- Implement time-sync warning: if TOTP validation fails repeatedly, suggest "Check your device clock is synchronized with network time" in error message.
- Add TOTP device self-service reset flow: if user locked out, send email with time-limited reset link allowing TOTP disable after identity verification (answering security questions or admin approval).

### Testing controls (manufacturer)

- Unit test: Submit TOTP login with code "000000". Assert client-side validation rejects before API call with message "Invalid code format." Verify API not called.
- Integration test: Submit valid format but incorrect TOTP code (wrong 6 digits). Assert server returns specific error "Invalid TOTP code - please try again" not generic "Authentication failed."
- Unit test: Submit TOTP code "abc123" (contains letters). Assert client-side validation rejects with message "Code must be 6 digits."
- Integration test: Generate valid TOTP code using time T, submit code using time T+90 seconds (outside typical 30-second window). Assert server suggests time sync issue if clock skew detected.

### Training controls (deployment)

- Train clinicians on TOTP usage: recommended authenticator apps (Google Authenticator, Authy, Microsoft Authenticator), importance of time sync.
- Document troubleshooting: If TOTP repeatedly fails: 1) Check device clock synced with network time 2) Verify correct account selected in authenticator app 3) Contact IT for backup code 4) Last resort: TOTP reset via email.
- Provide IT support hotline for emergency TOTP lockout (24/7 availability): IT can temporarily disable TOTP for account after verbal identity verification.

### Business process controls (deployment)

- IT policy: TOTP backup codes must be generated and stored securely (password manager or sealed envelope in secure location) during initial TOTP setup.
- Clinical governance: Emergency TOTP bypass procedure documented in IT runbook. IT staff authorized to disable TOTP for clinical emergency access after identity verification.
- Incident response: TOTP lockout during emergency documented as incident. Review for patterns (many users same time = system clock issue, single user = user training need).

**Harm:**
Delayed treatment while clinician attempts to reset 2FA, uses backup system, or waits for IT support. Potential patient harm from treatment delays in time-critical situations (stroke, sepsis, cardiac arrest).

**Code associated with hazard:**

- `frontend/src/auth/AuthContext.tsx:87-90`
