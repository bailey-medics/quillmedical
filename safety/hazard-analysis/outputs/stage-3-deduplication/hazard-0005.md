# Hazard

**Hazard id:** Hazard-0005

**Hazard name:** NHS number format or validation errors

**Description:** NHS number displayed with incorrect spacing, missing checksum validation, or formatted in a way that causes transcription errors when clinician manually copies to external systems.

**Causes:**

- Formatter does not validate 10-digit structure or Modulus 11 checksum
- Non-NHS systems (international) display unformatted numbers
- Copy-paste removes spacing causing confusion
- Backend validation only checks length and isdigit() but not checksum algorithm

**Effect:**
Clinician reads NHS number incorrectly when transcribing to external system (GP surgery, lab, pharmacy) or invalid NHS number stored in FHIR server.

**Hazard:**
Wrong patient record referenced in external system. Patient record cannot be matched to NHS Spine. External systems reject queries with invalid NHS number.

**Harm:**
Lab results sent to wrong patient, medication dispensed to wrong person. Patient's medication history not retrieved from GP system, drug interaction missed causing adverse reaction.

**Code associated with hazard:**

- `frontend/src/components/demographics/NationalNumber.tsx:16-59`
- `backend/app/fhir_client.py:127-132`
- `frontend/src/pages/Patient.tsx:123-142`
