# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

NHS number format or validation errors

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

NHS number displayed with incorrect spacing, missing checksum validation, or formatted in a way that causes transcription errors when clinician manually copies to external systems.

---

## Causes

1. Formatter does not validate 10-digit structure or Modulus 11 checksum
2. Non-NHS systems (international) display unformatted numbers
3. Copy-paste removes spacing causing confusion
4. Backend validation only checks length and isdigit() but not checksum algorithm

---

## Effect

Clinician reads NHS number incorrectly when transcribing to external system (GP surgery, lab, pharmacy) or invalid NHS number stored in FHIR server.

---

## Hazard

Wrong patient record referenced in external system. Patient record cannot be matched to NHS Spine. External systems reject queries with invalid NHS number.

---

## Hazard type

- WrongPatient
- IncorrectResult

---

## Harm

Lab results sent to wrong patient, medication dispensed to wrong person. Patient's medication history not retrieved from GP system, drug interaction missed causing adverse reaction.

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

- Implement NHS number Modulus 11 checksum validation algorithm in both frontend (NationalNumber.tsx) and backend (fhir_client.py). Reject NHS numbers that fail checksum validation with error message: "Invalid NHS number - checksum failed. Please verify number is correct."
- Add copy button next to NHS number display that copies number with spaces (123 456 7890 format) to clipboard. Show toast notification "NHS number copied to clipboard with formatting."
- Display NHS number in fixed-width monospace font with clear spacing: "123 456 7890" (not "1234567890"). Use bold font weight and larger size (16px minimum) for readability.
- Add validation on backend create_fhir_patient: before saving to FHIR, verify NHS number passes Modulus 11 algorithm. If invalid, return 400 Bad Request with specific error explaining checksum failure.
- Implement NHS number search/duplicate detection: before creating new patient, search FHIR server for existing patient with same NHS number. If found, display warning modal: "Patient with NHS number XXX XXX XXXX already exists. Verify you are not creating duplicate record."

### Testing controls (manufacturer)

- Unit test: Validate known valid NHS numbers (e.g., 943 476 5919) pass checksum validation. Test known invalid numbers (e.g., 123 456 7890) fail validation with correct error message.
- Unit test: NationalNumber component renders NHS number "9434765919" as "943 476 5919" with spaces. Assert copy button copies text with spaces intact.
- Integration test: Attempt to create FHIR patient with invalid NHS number via API POST /api/patients. Assert 400 error returned with message containing "checksum failed". Verify no FHIR resource created.
- Unit test: Test edge cases: 9-digit number (missing digit), 11-digit number (extra digit), letters in NHS number, special characters. Assert all rejected with specific error messages.
- Integration test: Create patient with NHS number A, attempt to create second patient with same NHS number A. Assert error displayed warning about duplicate NHS number before allowing creation.

### Training controls (deployment)

- Train clinicians to always verify NHS number checksum when manually entering from patient wristband or documentation. Provide quick reference card with Modulus 11 checksum algorithm or use NHS Spine validation tool.
- Document workflow: "When copying NHS number to external system, always copy from Quill system display (using copy button) to preserve formatting. Never retype manually from memory."
- Include in transcription training: NHS number format is XXX XXX XXXX (10 digits with spaces). Emphasize importance of accurate transcription to prevent patient matching errors.

### Business process controls (deployment)

- NHS Trust policy: All NHS numbers entered manually must be verified against NHS Spine or patient wristband barcode. Document verification source in patient record.
- Clinical governance: Pharmacy and laboratory systems must independently validate NHS number checksum before accepting specimens or dispensing medications. Reject invalid NHS numbers at point of entry.
- Patient registration SOP: Registration staff must scan patient wristband barcode to capture NHS number (preferred method) rather than manual typing. Manual entry only permitted when barcode unavailable, with mandatory second-person verification.
- Audit requirement: Monthly audit of NHS number accuracy by sampling 50 records and checking against NHS Spine. Identify trends in NHS number entry errors for targeted training.

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- frontend/src/components/demographics/NationalNumber.tsx:16-59
- backend/app/fhir_client.py:127-132
- frontend/src/pages/Patient.tsx:123-142
