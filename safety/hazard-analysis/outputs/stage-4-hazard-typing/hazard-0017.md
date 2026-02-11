# Hazard

**Hazard id:** Hazard-0017

**Hazard name:** Invalid letter content stored in EHRbase

**Description:** create_letter_composition function does not validate letter content before submission to EHRbase including content length limits, markdown safety, or required field validation beyond type checking.

**Causes:**

- No content length limits enforced
- No validation of markdown safety (potential XSS if rendered unsafely)
- No check for required fields beyond TypeScript/Pydantic type checking
- Malicious or corrupted letter content accepted

**Effect:**
Invalid or malicious letter content stored in OpenEHR composition. Letter cannot be displayed correctly or contains injection attacks.

**Hazard:**
Critical clinical letter unreadable when needed for emergency treatment decision. Corrupted letter content causes UI crash or display errors.

**Hazard types:**

- CorruptedData
- NoAccessToData

**Harm:**
Clinician cannot access critical clinical information during emergency, leading to delayed treatment or incorrect treatment decisions. Patient harm due to missing clinical context.

**Code associated with hazard:**

- `backend/app/ehrbase_client.py:155-233`
