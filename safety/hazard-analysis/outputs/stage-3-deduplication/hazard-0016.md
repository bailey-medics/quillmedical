# Hazard

**Hazard id:** Hazard-0016

**Hazard name:** EHRbase orphaned letters

**Description:** create_ehr function accepts subject_id string without validating it corresponds to real FHIR patient, allowing EHR creation with non-existent patient ID causing orphaned clinical letters.

**Causes:**

- Function only checks subject_id not empty/whitespace
- No FHIR patient existence verification
- Accepts arbitrary UUIDs or strings as patient identifiers

**Effect:**
EHR created with non-existent patient ID. Letters written for wrong patient ID cannot be retrieved via patient page.

**Hazard:**
Clinical information lost in orphaned EHR, treatment decisions made without complete clinical history.

**Harm:**
Critical clinical letter documenting allergy or contraindication not accessible, clinician prescribes contraindicated medication causing anaphylaxis or adverse reaction.

**Code associated with hazard:**

- `backend/app/ehrbase_client.py:28-30`
