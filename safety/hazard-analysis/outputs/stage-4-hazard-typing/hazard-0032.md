# Hazard

**Hazard id:** Hazard-0032

**Hazard name:** Login response exposes role information

**Description:** Login endpoint returns user roles in HTTP response body JSON, exposing authorization structure and role names to potential attackers via enumeration.

**Causes:**

- Login response includes roles array in JSON
- Information not necessary for client-side auth (roles already in JWT payload)
- Allows attacker to enumerate role names without being authenticated

**Effect:**
Attacker can learn system has "Clinician", "Administrator", "Billing Staff" roles by calling login endpoint, aiding privilege escalation attack planning.

**Hazard:**
Information disclosure aids targeted attacks on administrative or high-privilege accounts.

**Hazard types:**

- DataBreach

**Harm:**
Increased risk of successful privilege escalation attack leading to unauthorized administrative access. Potential for complete system compromise allowing attacker to modify clinical records causing patient harm.

**Code associated with hazard:**

- `backend/app/main.py:280-285`
