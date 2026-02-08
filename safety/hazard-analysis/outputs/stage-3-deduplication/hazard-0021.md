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

**Harm:**
False clinical information entered into medical record (e.g., forged allergy documentation, incorrect medication list) leading to incorrect treatment decisions and patient harm.

**Code associated with hazard:**

- `backend/app/main.py:650-680`
