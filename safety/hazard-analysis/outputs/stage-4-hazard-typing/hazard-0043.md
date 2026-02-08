# Hazard

**Hazard id:** Hazard-0043

**Hazard name:** EHRbase API publicly exposed

**Description:** Caddyfile exposes `/ehrbase/*` route publicly, allowing direct access to EHRbase API without backend authorization checks, bypassing role-based access controls.

**Causes:**

- Caddy reverse proxy route configured to EHRbase without authentication requirement
- No authorization middleware on route
- Anyone can query clinical letters via AQL directly against EHRbase

**Effect:**
Attacker can bypass backend authorization and query EHRbase directly using AQL or REST API, accessing all clinical letters without authentication.

**Hazard:**
Unauthorized access to all clinical letters in system, complete bypass of role-based access controls.

**Hazard types:**

- DataBreach

**Harm:**
Data breach with unauthorized viewing of all patient clinical documents. GDPR violation. Massive patient privacy harm from exposure of sensitive clinical information (diagnoses, treatments, prognoses).

**Code associated with hazard:**

- `caddy/dev/Caddyfile`
