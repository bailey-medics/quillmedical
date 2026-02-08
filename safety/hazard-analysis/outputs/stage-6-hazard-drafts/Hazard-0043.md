# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

EHRbase API publicly exposed

---

## General utility label

[2]

---

## Likelihood scoring

TBC

---

## Severity scoring

TBC

---

## Description

Caddyfile exposes `/ehrbase/*` route publicly, allowing direct access to EHRbase API without backend authorization checks, bypassing role-based access controls.

---

## Causes

1. Caddy reverse proxy route configured to EHRbase without authentication requirement
2. No authorization middleware on route
3. Anyone can query clinical letters via AQL directly against EHRbase

---

## Effect

Attacker can bypass backend authorization and query EHRbase directly using AQL or REST API, accessing all clinical letters without authentication.

---

## Hazard

Unauthorized access to all clinical letters in system, complete bypass of role-based access controls.

---

## Hazard type

- UnauthorizedAccess

---

## Harm

Data breach with unauthorized viewing of all patient clinical documents. GDPR violation. Massive patient privacy harm from exposure of sensitive clinical information (diagnoses, treatments, prognoses).

---

## Existing controls

None identified during initial analysis.

---

## Assignment

Clinical Safety Officer

---

## Labelling

TBC (awaiting scoring)

---

## Project

Clinical Risk Management

---

## Hazard controls

### Design controls (manufacturer)

- Remove `/ehrbase/*` route from Caddyfile entirely. EHRbase should never be directly accessible from internet. Only backend service on internal Docker network communicates with EHRbase. All clinical letter access must go through backend /api/patients/{id}/letters endpoints (which enforce authentication and authorization).
- Implement network isolation: move EHRbase to separate Docker network (internal: true) with no external connectivity. Only backend service joins both public and ehrbase networks. Prevents any possibility of direct EHRbase access from internet.
- Add EHRbase authentication: configure EHRbase to require HTTP Basic Auth for all API requests. Create unique credentials for backend service (different from admin credentials). Backend includes Basic Auth header in all EHRbase requests. Even if EHRbase exposed, requires valid credentials.
- Implement IP allowlisting in EHRbase: configure EHRbase to only accept connections from backend container IP address. Reject all other connections. Add this as EHRbase configuration (EHRBASE_SECURITY_ALLOWED_IPS environment variable or similar).
- Add audit logging for all EHRbase access: EHRbase logs all API requests with source IP, authenticated user, operation performed, timestamp. Backend includes user context in requests (e.g., X-User-ID header). Audit trail shows which clinician accessed which patient's letters.

### Testing controls (manufacturer)

- Integration test: Attempt to query EHRbase directly via http://quillmedical.com/ehrbase/rest/openehr/v1/ehr. Assert connection refused or 404 Not Found (route doesn't exist).
- Network test: From external network (outside Docker), attempt to connect to EHRbase container IP:8080. Assert connection timeout or refused (EHRbase on internal-only network).
- Authentication test: If EHRbase still exposed, attempt API request without Basic Auth header. Assert 401 Unauthorized. Attempt with invalid credentials. Assert 401. Attempt with valid backend credentials. Assert 200 OK (demonstrates authentication required).
- Authorization bypass test: Attempt to use backend /api/patients/{id}/letters endpoint without JWT token. Assert 401. Attempt to access patient B's letter while authenticated as clinician assigned to patient A only. Assert 403 Forbidden. Verify backend enforces authorization even though EHRbase would allow access.

### Training controls (deployment)

- Train operations team on network architecture: explain EHRbase never exposed publicly, only backend accesses EHRbase, importance of maintaining network isolation.
- Document incident response: if EHRbase accidentally exposed (e.g., misconfigured Caddyfile), immediately remove route and redeploy. Audit EHRbase access logs for unauthorized access during exposure period. Assess data breach impact.

### Business process controls (deployment)

- Configuration review policy: All Caddyfile changes reviewed by security team before deployment. Check for public exposure of internal services (EHRbase, FHIR, databases). Automated tests must pass before deployment (including network isolation tests).
- Penetration testing: Annual penetration test includes attempts to access internal services (EHRbase, FHIR, databases) directly from internet. Verify all attempts fail. Document any discovered exposures as critical vulnerabilities requiring immediate remediation.
- Network monitoring: Monitor network traffic for unexpected connections to EHRbase from external IPs. Alert if EHRbase receives any non-backend connections. Investigate as potential security incident.
- Audit log review: Security team reviews EHRbase audit logs monthly. Verify all access came from backend service (expected IP address). Investigate any access from unexpected sources. Correlate EHRbase access with backend user authentication logs (ensure clinician was authenticated when EHRbase access occurred).
- DataBreach

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- caddy/dev/Caddyfile
