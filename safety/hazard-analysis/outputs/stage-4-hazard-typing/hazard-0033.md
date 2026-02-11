# Hazard

**Hazard id:** Hazard-0033

**Hazard name:** Secrets potentially logged on startup

**Description:** If config.py or main.py logs settings object during startup, sensitive secrets like JWT_SECRET may be exposed in application logs since Pydantic BaseSettings **repr** includes all fields.

**Causes:**

- Pydantic BaseSettings **repr** includes all fields including SecretStr
- Dev logging may print entire settings object for debugging
- Application logs may be shipped to external logging service or stored on disk

**Effect:**
JWT_SECRET, database passwords, VAPID keys, or other secrets exposed in plaintext in application logs.

**Hazard:**
Attacker with log access (compromised logging service, log file access, insider threat) can obtain JWT_SECRET and forge authentication tokens for any user.

**Hazard types:**

- DataBreach

**Harm:**
Complete authentication bypass allowing unauthorized access to all patient records. Attacker could modify clinical data causing patient harm through falsified records leading to incorrect treatment.

**Code associated with hazard:**

- `backend/app/config.py`
