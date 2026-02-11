# Hazard

**Hazard id:** Hazard-0040

**Hazard name:** Weak secrets allowed in configuration

**Description:** Settings class uses pydantic-settings but doesn't validate critical fields like JWT_SECRET minimum length or complexity, allowing production deployment with weak secrets.

**Causes:**

- SecretStr type doesn't enforce length constraints or complexity
- No @validator function for JWT_SECRET, database passwords, or other secrets
- Weak secrets like "secret123" or "password" accepted without warning

**Effect:**
Production deployment with weak JWT secret, database passwords, or other security-critical secrets.

**Hazard:**
Attacker can brute force weak secrets and forge authentication tokens, access databases, or compromise system.

**Hazard types:**

- DataBreach

**Harm:**
Complete system compromise with unauthorized access to all patient records. Attacker could modify clinical data causing patient harm through falsified records leading to incorrect treatment decisions.

**Code associated with hazard:**

- `backend/app/config.py`
