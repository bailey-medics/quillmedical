# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Race condition in EHR creation causes duplicate clinical records

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

The `get_or_create_ehr` function in `ehrbase_client.py` used a non-atomic check-then-create pattern. Two concurrent requests for the same patient could both observe "no EHR exists" and both attempt to create one, resulting in duplicate clinical records for a single patient.

---

## Causes

1. Non-atomic check-then-create pattern with no locking or conflict handling
2. Multiple clinicians or system processes accessing a new patient simultaneously
3. Network latency between the GET check and POST create allowing interleaving

---

## Effect

Duplicate EHR records created in EHRbase for the same patient. Clinical notes, letters, and compositions split across two separate records. Clinicians viewing one record see incomplete clinical history.

---

## Hazard

Potential for a patient to have fragmented clinical records where important clinical information (allergies, medications, diagnoses) is recorded in one EHR while a clinician views the other, leading to decisions made on incomplete information.

---

## Hazard type

- WrongPatientContext
- DataLoss
- IncompleteInformation

---

## Harm

Clinician makes treatment decision based on incomplete clinical record. Potential for missed allergies, drug interactions, or contraindications. Severity ranges from minor (duplicate record detected and merged) to serious (treatment decision based on incomplete information causes patient harm).

---

## Existing controls

EHRbase server enforces a unique constraint on `subject_id + subject_namespace`, returning HTTP 409 Conflict if a duplicate EHR creation is attempted. However, prior to this fix, the application did not handle this 409 response gracefully.

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

- Handle HTTP 409 Conflict from EHRbase: `create_ehr()` now raises `EhrAlreadyExistsError` when EHRbase returns 409, indicating another request already created the EHR for this patient. This prevents the error from propagating as an unhandled 500 to the user.
- Retry pattern in `get_or_create_ehr()`: When `EhrAlreadyExistsError` is caught, the function re-fetches the EHR via `get_ehr_by_subject()` and returns the existing record. The race condition is resolved transparently — neither request fails, and both use the same EHR.
- Logging: Race condition resolution is logged at INFO level (`"EHR creation race condition resolved for subject %s"`) for audit trail and monitoring. No PHI is included in the log message (only the FHIR patient ID, which is an opaque UUID).
- EHRbase server-side unique constraint on `subject_id + subject_namespace` acts as the ultimate guard — even if application-level logic fails, duplicates cannot be created at the database level.

### Testing controls (manufacturer)

- Unit test `test_get_or_create_ehr_race_condition_resolved`: Simulates the race condition (GET returns 404, POST returns 409, retry GET returns existing EHR). Asserts the function returns the correct EHR ID without raising an exception.
- Unit test `test_get_or_create_ehr_race_condition_unresolvable`: Simulates the edge case where 409 is received but retry GET also returns 404 (EHR was deleted between attempts). Asserts `EhrAlreadyExistsError` is raised for manual investigation.
- Unit test `test_create_ehr_conflict_raises`: Verifies that `create_ehr()` correctly raises `EhrAlreadyExistsError` on HTTP 409.
- Integration test (future): Simulate concurrent EHR creation for the same patient using threading/asyncio to verify end-to-end behaviour under load.

### Training controls (deployment)

- Clinical staff are not affected — the fix is transparent. No user-facing behaviour changes.
- Development team aware that all EHRbase interactions must handle 409 Conflict for idempotent operations.

### Business process controls (deployment)

- Monitoring: INFO-level log messages for race condition resolution should be monitored. Frequent occurrences may indicate a system performance issue or unusual access pattern requiring investigation.
- Data audit: Periodic check of EHRbase for any patients with multiple EHR records (pre-existing duplicates from before this fix). Any found should be merged by a clinical administrator.

---

## Residual hazard risk assessment

Very low. The combination of EHRbase server-side unique constraint (prevents duplicates at database level) and application-level retry logic (handles the 409 gracefully) means duplicate EHRs cannot be created. The only residual risk is if EHRbase itself has a bug in its unique constraint enforcement, which is outside application control.

---

## Hazard status

Fixed — controls implemented 4 May 2026

---

## Code associated with hazard

- backend/app/ehrbase_client.py
- backend/tests/test_ehrbase_client.py
