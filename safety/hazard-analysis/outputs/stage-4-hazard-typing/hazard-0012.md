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

**Hazard types:**

- Duplicate
- WrongPatient

**Harm:**
Allergy documented in one record but not visible in duplicate record, causing clinician to prescribe contraindicated medication leading to anaphylaxis. Medication list incomplete causing drug interaction or duplicate prescribing.

**Code associated with hazard:**

- `backend/app/fhir_client.py:89-212`
