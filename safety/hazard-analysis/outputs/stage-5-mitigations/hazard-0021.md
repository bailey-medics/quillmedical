# Hazard

**Hazard id:** Hazard-0021

**Hazard name:** Missing CSRF protection on clinical operations

**Description:** POST /api/patients/{patient_id}/letters and other state-changing clinical operations do not require CSRF token, vulnerable to Cross-Site Request Forgery attacks.

**Causes:**

- Route uses `require_roles("Clinician")` but not `require_csrf` dependency
- CSRF token only required on some routes inconsistently
- Malicious website can forge requests using victim's session cookies

**Effect:**
Malicious website can trigger authenticated clinician's browser to create letter, modify demographics, or perform other state-changing operations via forged POST request.

**Hazard:**
Forged clinical letters or demographic changes created in patient records without clinician awareness or consent.

**Hazard controls:**

### Design controls (manufacturer)

- Add `require_csrf` dependency to ALL POST/PUT/PATCH/DELETE endpoints that modify data. Create FastAPI dependency decorator: `CSRFProtected = Depends(require_csrf)`. Add to route signatures: `def create_letter(..., _csrf: CSRFProtected)`.
- Implement CSRF token validation in API client (frontend): automatically include X-CSRF-Token header from cookie in all state-changing requests. Fail fast if CSRF cookie missing before API call.
- Add double-submit cookie pattern: generate random CSRF token, store in cookie AND session. Validate both match on state-changing requests. Prevents token theft via XSS.
- Create CSRF middleware that validates all POST/PUT/PATCH/DELETE requests have valid CSRF token, reject with 403 Forbidden if missing/invalid. Centralized enforcement instead of per-route.
- Log CSRF validation failures with request details (IP, User-Agent, referer) to security audit log. Alert if >10 CSRF failures from single IP within 1 hour.

### Testing controls (manufacturer)

- Integration test: Attempt POST /api/patients/{id}/letters without X-CSRF-Token header. Assert 403 Forbidden error returned with message "CSRF token required."
- Integration test: Include X-CSRF-Token header with invalid/expired token. Assert 403 error returned, request not processed.
- Security test: Simulate CSRF attack by creating malicious HTML page with form auto-submitting to /api/patients/{id}/letters using clinician's cookies (no CSRF token). Assert request rejected despite valid session cookies.
- Unit test: Test double-submit cookie pattern - attempt request with CSRF token in header that doesn't match token in cookie. Assert rejected.

### Training controls (deployment)

- Train developers on CSRF protection requirements: ALL state-changing endpoints must require CSRF token. Include in code review checklist.
- Document security guidelines: CSRF protection is mandatory for compliance with NHS Digital security standards.

### Business process controls (deployment)

- IT security policy: Code review must verify CSRF protection on all state-changing API endpoints. No exceptions for "internal" routes.
- Penetration testing requirement: Annual security audit must include CSRF attack testing on all clinical data modification endpoints.
- Incident response: If CSRF vulnerability detected, immediately deploy fix. Conduct forensic review of all suspicious data modifications in past 90 days.

**Harm:**
False clinical information entered into medical record (e.g., forged allergy documentation, incorrect medication list) leading to incorrect treatment decisions and patient harm.

**Code associated with hazard:**

- `backend/app/main.py:650-680`
