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

**Hazard controls:**

### Design controls (manufacturer)

- Implement deduplication in add_avatar_gradient_extension: before appending new extension, filter out any existing extensions with AVATAR_GRADIENT_EXTENSION_URL. Replace with new extension rather than appending duplicate.
- Add idempotency to extension updates: function should check if extension with desired value already exists, return early without modification if gradient unchanged.
- Create get_or_set_avatar_gradient helper function encapsulating both read and write logic: first check if gradient exists, only add if missing. Ensures single extension per patient.
- Add FHIR resource validation in backend: after any patient update, scan extension array for duplicate URLs, log warning if duplicates detected, automatically deduplicate before saving.
- Implement database constraint or validation rule in HAPI FHIR configuration preventing duplicate extensions with same URL on single resource.

### Testing controls (manufacturer)

- Unit test: Create patient resource, call add_avatar_gradient_extension twice with different gradient values. Assert only one extension exists in patient.extension array, value matches most recent call.
- Integration test: Create patient via API, update demographics 5 times triggering gradient addition. Fetch patient from FHIR, assert patient.extension array contains exactly one avatar gradient extension.
- Unit test: Patient resource with existing gradient "15", call add_avatar_gradient_extension with "15" again. Assert function returns early without modifying resource (idempotent behavior).
- Integration test: Simulate race condition where two concurrent requests both attempt to add gradient. Assert only one extension created, no duplicates in final FHIR resource.

### Training controls (deployment)

- Document for developers: Avatar gradient is visual aid only, not clinical identifier. Inconsistent colors are low clinical risk.
- Train clinicians not to rely on avatar color for patient identification. Emphasize redundancy of name/DOB/NHS number verification.

### Business process controls (deployment)

- IT governance: FHIR resource structure must be validated in code review. Any code modifying patient.extension array must include duplicate prevention check.
- Data quality monitoring: Weekly scan of FHIR patient resources checking for duplicate extensions. Alert if >1% of patients have duplicate extensions, trigger investigation.

**Harm:**
Low direct clinical harm but contributes to visual identification errors when clinician relies on color cue to distinguish patients.

**Code associated with hazard:**

- `backend/app/fhir_client.py:54-67`
