# Hazard

**Hazard id:** Hazard-0015

**Hazard name:** EHRbase EHR creation race condition

**Description:** get_or_create_ehr function has check-then-create race condition where two concurrent requests can both create EHR for same patient because operation is not atomic.

**Causes:**

- Function checks for existing EHR then creates if missing (not atomic)
- No database-level unique constraint on subject_id
- Two FastAPI workers handle requests simultaneously for same patient

**Effect:**
Two EHR records created for same patient in EHRbase with different EHR IDs.

**Hazard:**
Clinical letters split across two EHRs, clinician viewing one EHR only sees subset of patient's letters, missing critical clinical information.

**Hazard controls:**

### Design controls (manufacturer)

- Add distributed lock using Redis before EHR creation: acquire lock with key "ehr_create:{patient_id}", TTL 10 seconds. Only proceed with creation if lock acquired, otherwise wait and retry. Release lock after creation completes.
- Implement idempotent EHR creation with try-catch: attempt create, if 409 Conflict or duplicate key error returned, search for existing EHR and return that ID instead of failing.
- Add database unique constraint in EHRbase PostgreSQL on ehr.subject_id column (if schema allows modification). Prevents duplicate EHRs at database level.
- Implement EHR merge endpoint for administrators: if duplicates detected, merge letters from both EHRs into single canonical EHR, deprecate duplicate EHR with redirect.
- Add monitoring/alerting: scan EHRbase daily for patients with multiple EHRs (GROUP BY subject_id HAVING COUNT(\*) > 1), alert administrators for manual review and merge.

### Testing controls (manufacturer)

- Integration test: Simulate concurrent requests by launching two parallel API calls to create letter for same patient (who has no EHR). Assert only one EHR created, both requests receive same EHR ID. Verify no race condition duplicates.
- Unit test: Mock get_or_create_ehr to detect race condition attempt, verify locking mechanism prevents second creation during first operation.
- Integration test: Create two EHRs manually for same patient (simulating race condition), query letters list. Verify frontend displays warning "Multiple EHRs detected - contact IT" and shows letters from all EHRs with clear indication of source EHR.
- Load test: Generate 100 concurrent requests for new patient, verify only one EHR created despite high concurrency.

### Training controls (deployment)

- Train administrators on EHR merge procedure: how to identify duplicates, verify letters from both EHRs belong to same patient, execute merge without data loss.
- Document escalation: If clinician suspects missing letters, instruct to contact IT who can check for duplicate EHRs in EHRbase database.

### Business process controls (deployment)

- IT governance: EHR merge operations must be logged in audit trail with administrator approval. Include pre/post verification steps to ensure no letters lost during merge.
- Clinical governance: If duplicate EHR detected after clinical decision made, incident must be reported for review of whether missing information affected care.
- Monitoring requirement: Daily automated scan for duplicate EHRs with alert to IT team. Target resolution time <24 hours for duplicate EHR merges.

**Harm:**
Recent clinical letter with contraindication not visible in viewed EHR, medication prescribed causing adverse reaction.

**Code associated with hazard:**

- `backend/app/ehrbase_client.py:100-106`
