# Hazard

**Hazard id:** Hazard-0018

**Hazard name:** JWT token expiry during long clinical session

**Description:** Access token expires after 15 minutes regardless of user activity, causing authentication failure mid-workflow during long clinical sessions where clinician fills out forms or reviews records for extended periods.

**Causes:**

- Token expiry is time-based not activity-based
- Frontend only retries on 401, doesn't proactively refresh before expiry
- Long-running clinical session times out mid-workflow

**Effect:**
Clinician fills out clinical documentation form for 20+ minutes, submits, receives 401 error, loses unsaved form data.

**Hazard:**
Clinical documentation lost, must be re-entered from memory. Clinician forgets or omits critical details during re-entry.

**Hazard types:**

- DataLoss
- NoDocumentationOfClinicalInteraction

**Harm:**
Incomplete documentation affects patient care. Critical clinical details (allergies, medication changes, examination findings) forgotten during re-entry, leading to patient harm from missing information.

**Code associated with hazard:**

- `backend/app/main.py:1-300`
- `backend/app/security.py:87-101`
