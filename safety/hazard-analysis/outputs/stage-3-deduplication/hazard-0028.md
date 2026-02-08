# Hazard

**Hazard id:** Hazard-0028

**Hazard name:** TOTP secrets not encrypted at rest

**Description:** TOTP secrets stored in database as plaintext VARCHAR(64) without column-level encryption, exposing all TOTP secrets if attacker obtains database dump.

**Causes:**

- models.py defines totp_secret as VARCHAR(64) with no encryption
- No column-level encryption enabled
- Database dump exposes all TOTP secrets in plaintext

**Effect:**
Attacker with database access (SQL injection, backup theft, insider threat) obtains all TOTP secrets and can generate valid 2FA codes for any user.

**Hazard:**
Unauthorized access to clinician accounts even with 2FA enabled, completely bypassing two-factor authentication protection.

**Harm:**
Data breach with unauthorized viewing/editing of all patient records. Attacker could modify clinical data causing patient harm through falsified records leading to incorrect treatment decisions.

**Code associated with hazard:**

- `backend/app/models.py`
- `backend/app/security.py`
