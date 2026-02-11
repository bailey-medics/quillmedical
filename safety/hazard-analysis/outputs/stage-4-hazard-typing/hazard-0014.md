# Hazard

**Hazard id:** Hazard-0014

**Hazard name:** Duplicate avatar gradient FHIR extensions

**Description:** add_avatar_gradient_extension function appends to patient.extension array without checking for existing gradient extension, allowing multiple extensions with same URL but different values.

**Causes:**

- Function appends new Extension without deduplication check
- Multiple calls to function result in duplicate extensions
- No check if AVATAR_GRADIENT_EXTENSION_URL already exists in array

**Effect:**
Patient resource has multiple avatar gradient extensions with different values. Frontend extracts first or last extension value non-deterministically.

**Hazard:**
Avatar color inconsistent across different pages or sessions, contributing to patient identification confusion.

**Hazard types:**

- WrongPatientContext
- Duplicate

**Harm:**
Low direct clinical harm but contributes to visual identification errors when clinician relies on color cue to distinguish patients.

**Code associated with hazard:**

- `backend/app/fhir_client.py:54-67`
