# Hazard

**Hazard id:** Hazard-0019

**Hazard name:** FHIR server health check false negative

**Description:** Startup health check queries FHIR server once during backend startup, but if FHIR container starts after backend, health appears unavailable even though server becomes functional shortly after.

**Causes:**

- Health check runs on startup event, never re-checks during runtime
- FHIR container may take 30-60 seconds to fully start
- Backend starts faster, sees 500 error, logs failure, but continues anyway

**Effect:**
Backend logs "FHIR server not available" but server actually works normally after startup completes.

**Hazard:**
Clinician sees error messages or assumes patient operations unavailable based on logs, uses workaround system or paper-based system, causes data entry duplication.

**Hazard types:**

- Duplicate
- SystemUnavailable

**Harm:**
Duplicate patient records created in backup/workaround system. Medical history fragmented across systems causing missed allergies or medication interactions.

**Code associated with hazard:**

- `backend/app/main.py:158-186`
