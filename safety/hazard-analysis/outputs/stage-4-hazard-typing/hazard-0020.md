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

**Hazard types:**

- DataBreach

**Harm:**
Data breach with unauthorized viewing of patient records causing GDPR violation and patient privacy harm. Attacker could modify patient records causing clinical harm.

**Code associated with hazard:**

- `backend/app/main.py:220-290`
