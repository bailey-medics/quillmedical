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

**Hazard controls:**

### Design controls (manufacturer)

- Add FHIR patient existence validation in create_ehr: before creating EHR, call `GET /Patient/{subject_id}` to verify patient exists. If 404 returned, reject EHR creation with 400 error: "Cannot create EHR - patient ID does not exist in FHIR server."
- Implement foreign key-like validation: maintain cache of valid patient IDs in Redis with TTL 5 minutes. Check patient ID against cache before EHR creation, refresh cache on miss by querying FHIR.
- Add EHRbase API wrapper function validate_subject_id_exists that encapsulates patient lookup, use this function in all EHR creation code paths.
- Create orphaned EHR detection job: daily scan EHRbase for EHRs with subject_ids that don't match any FHIR patient, log orphaned EHRs for manual investigation and remediation.
- Add patient-EHR link verification endpoint for administrators: input patient FHIR ID, return EHR ID if exists, create if missing, report if multiple/orphaned EHRs detected.

### Testing controls (manufacturer)

- Integration test: Attempt to create EHR with non-existent patient ID "abc-fake-123" via backend function. Assert validation error raised before EHRbase API called. Verify error message includes patient ID and states "patient not found."
- Unit test: Mock FHIR patient lookup to return 404, call create_ehr with that patient ID. Assert function raises ValueError or custom exception, does not proceed with EHR creation.
- Integration test: Create FHIR patient, delete patient, attempt to create letter (which triggers EHR creation). Assert error returned preventing orphaned EHR creation.
- Integration test: Scan EHRbase for all EHRs, cross-reference subject_ids against FHIR patient IDs, assert no orphaned EHRs exist in test database.

### Training controls (deployment)

- Train developers on importance of referential integrity between FHIR and EHRbase. Document patient ID validation pattern to use in all EHR-creating code.
- Document operational procedure: If orphaned EHR discovered, investigate cause (deleted patient?, bad import?, bug?), remediate by either restoring patient or marking EHR deprecated.

### Business process controls (deployment)

- IT governance: Code review must verify all EHR creation paths include patient existence validation. No EHR creation without FHIR patient lookup.
- Monitoring requirement: Weekly automated scan for orphaned EHRs. Alert if any detected, trigger investigation into root cause.
- Data migration policy: When importing historical data, validate all patient-EHR links before go-live. Reject imports with orphaned EHRs.

**Harm:**
Critical clinical letter documenting allergy or contraindication not accessible, clinician prescribes contraindicated medication causing anaphylaxis or adverse reaction.

**Code associated with hazard:**

- `backend/app/ehrbase_client.py:28-30`
