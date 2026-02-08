# Hazard

**Hazard id:** Hazard-0042

**Hazard name:** Caddy reverse proxy lacks rate limiting

**Description:** Caddy reverse proxy configuration has no rate limiting directive, allowing DoS attacks that can overwhelm backend services and make clinical system unavailable.

**Causes:**

- Caddyfile defines routes but no rate_limit middleware
- No request throttling or connection limits
- Attacker can flood /api endpoints with unlimited requests

**Effect:**
Backend overwhelmed with requests, becomes unresponsive to legitimate clinical users.

**Hazard:**
Clinical system unavailable during attack, clinicians cannot access patient data for treatment decisions.

**Harm:**
Delayed treatment while clinicians use backup paper system. Potential patient harm in emergencies where rapid access to clinical information (allergies, medications, lab results) affects treatment decisions.

**Code associated with hazard:**

- `caddy/dev/Caddyfile`
