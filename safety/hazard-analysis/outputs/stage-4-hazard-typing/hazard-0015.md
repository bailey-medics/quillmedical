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

**Hazard types:**

- Duplicate
- NoAccessToData

**Harm:**
Recent clinical letter with contraindication not visible in viewed EHR, medication prescribed causing adverse reaction.

**Code associated with hazard:**

- `backend/app/ehrbase_client.py:100-106`
