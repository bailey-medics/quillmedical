# Hazard

**Hazard id:** Hazard-0026

**Hazard name:** Password hashing without pepper

**Description:** Password hash_password uses Argon2 with default parameters but no pepper (server-side secret mixed into hash), making passwords vulnerable to cracking if attacker obtains database dump.

**Causes:**

- hash_password uses argon2.hash() with no additional server-side secret
- No PEPPER environment variable mixed into hash before storage
- Standard Argon2 can be cracked with sufficient computing power if attacker has database dump

**Effect:**
Attacker with database access (SQL injection, backup theft, insider threat) can crack weak passwords using rainbow tables or GPU-accelerated cracking.

**Hazard:**
Unauthorized access to clinician accounts after successful password cracking.

**Harm:**
Data breach with unauthorized viewing/editing of patient records. Attacker could modify clinical data causing patient harm through falsified records leading to incorrect treatment.

**Code associated with hazard:**

- `backend/app/security.py:40-48`
