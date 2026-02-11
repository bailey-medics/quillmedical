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

**Hazard types:**

- DataBreach

**Harm:**
Complete system compromise with unauthorized access to all patient data. Attacker can forge clinical actions (create letters, edit demographics, modify records) causing patient harm through falsified clinical information.

**Code associated with hazard:**

- `backend/app/security.py:152-178`
