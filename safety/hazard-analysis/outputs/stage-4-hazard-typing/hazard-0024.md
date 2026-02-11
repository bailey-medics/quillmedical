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

**Hazard types:**

- NoAccessToData
- SystemUnavailable

**Harm:**
Delayed treatment while clinician attempts to reset 2FA, uses backup system, or waits for IT support. Potential patient harm from treatment delays in time-critical situations (e.g., stroke, sepsis, cardiac arrest).

**Code associated with hazard:**

- `frontend/src/auth/AuthContext.tsx:87-90`
