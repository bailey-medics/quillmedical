# Hazard

**Hazard id:** Hazard-0044

**Hazard name:** Overly permissive CORS configuration

**Description:** If Caddyfile configures CORS headers with wildcard Access-Control-Allow-Origin (\*), malicious websites can make authenticated API requests using victim's cookies.

**Causes:**

- Access-Control-Allow-Origin set to wildcard "\*"
- No credentials=true validation
- Allows malicious site to make cross-origin requests with authentication

**Effect:**
Attacker-controlled website can make API requests to backend using victim clinician's browser cookies, bypassing CSRF protection.

**Hazard:**
CSRF attacks succeed despite CSRF token protection, allowing forged clinical actions (create letter, edit demographics, modify records).

**Harm:**
False clinical information entered into medical records through forged requests. Incorrect treatment decisions based on falsified data causing patient harm.

**Code associated with hazard:**

- `caddy/dev/Caddyfile`
