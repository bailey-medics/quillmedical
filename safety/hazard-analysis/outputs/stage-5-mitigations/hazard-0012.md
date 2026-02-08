# Hazard

**Hazard id:** Hazard-0012

**Hazard name:** Duplicate FHIR patient creation

**Description:** create_fhir_patient function does not check if patient with same NHS number or name/DOB combination already exists before creating new FHIR resource, allowing duplicate patient records.

**Causes:**

- No search query before POST to FHIR server
- FHIR server allows duplicate resources with different IDs
- Frontend does not prevent duplicate submission
- No uniqueness constraint on NHS number

**Effect:**
Duplicate patient records created in FHIR server with different FHIR IDs but representing same physical person.

**Hazard:**
Clinical team works on two separate records for same patient, medical history fragmented across records. Clinician viewing one record does not see clinical information in duplicate record.

**Hazard controls:**

### Design controls (manufacturer)

- Implement duplicate detection in create_fhir_patient: before POST, search FHIR server for existing patient with same NHS number using FHIR search: `GET /Patient?identifier=https://fhir.nhs.uk/Id/nhs-number|[NHS-NUMBER]`. If found, return 409 Conflict error with existing patient details.
- Add similar-name detection: search for patients with Levenshtein distance <3 from entered name AND matching DOB. Display warning modal: "Similar patient found: [Name] [DOB] [NHS Number]. Are you sure this is a different person?"
- Implement FHIR conditional create: use If-None-Exist header with identifier search parameter. FHIR server returns existing resource if duplicate detected instead of creating new resource.
- Add duplicate prevention in frontend registration form: on NHS number blur event, call validation endpoint to check if NHS number already exists. Disable submit button and show error "Patient with this NHS number already exists" with link to existing record.
- Create backend merge-patient endpoint for administrators to combine duplicate records: merge demographics, link to both EHRs, redirect all references to canonical patient ID.

### Testing controls (manufacturer)

- Integration test: Create patient A with NHS number "123 456 7890", attempt to create second patient with same NHS number. Assert 409 Conflict error returned, no second FHIR resource created. Verify error message includes existing patient FHIR ID.
- Integration test: Create patient "John Smith" DOB 1980-01-01, attempt to create "Jon Smith" same DOB. Assert warning modal displays suggesting possible duplicate. Verify clinician can override if legitimately different patients.
- Unit test: Mock FHIR search to return existing patient, call create_fhir_patient function. Assert function returns existing patient ID without creating duplicate, logs "Duplicate prevention - returning existing patient" message.
- Integration test: Simulate concurrent creation attempts for same NHS number from two browser sessions. Assert only one patient resource created, second request receives existing patient ID.

### Training controls (deployment)

- Train patient registration staff to always search by NHS number before creating new patient record. Workflow: "Search NHS number, then name+DOB, then DOB alone before clicking Create New Patient."
- Document escalation: If patient not found but should exist (e.g., known to have previous appointments), contact medical records team to search archive/merged records before creating new record.
- Include in new staff induction: "Duplicate patient records are serious safety issue. Always search thoroughly - better to spend extra minute searching than create duplicate that fragments medical history."

### Business process controls (deployment)

- NHS Trust policy: Patient registration must search three ways (NHS number, name+DOB, DOB+postcode) before creating new patient. Document search attempts in audit log.
- Data quality procedure: Daily automated duplicate detection scan using fuzzy matching on name+DOB+NHS number. Flag suspicious duplicates for manual review by medical records team.
- Clinical governance: Patient record merge policy must be documented. Merge requires senior approval and clinical review to verify correct records merged. Log all merge operations for audit.
- Quarterly duplicate audit: Sample 500 patients, search for potential duplicates. Calculate duplicate rate, set KPI target <0.1% duplicate rate across patient database.

**Harm:**
Allergy documented in one record but not visible in duplicate record, causing clinician to prescribe contraindicated medication leading to anaphylaxis. Medication list incomplete causing drug interaction or duplicate prescribing.

**Code associated with hazard:**

- `backend/app/fhir_client.py:89-212`
