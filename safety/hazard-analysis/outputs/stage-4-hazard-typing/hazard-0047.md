# Hazard

**Hazard id:** Hazard-0047

**Hazard name:** Database migrations run without backup validation

**Description:** Alembic migrations run automatically on `alembic upgrade head` without prompting for database backup verification, risking data loss if migration fails mid-operation.

**Causes:**

- No pre-migration hook to check for recent database backup
- No warning displayed to operator before destructive migrations
- Migration rollback (downgrade) functions rarely tested and may fail

**Effect:**
Migration fails mid-operation leaving database in inconsistent state, or downgrade fails preventing rollback.

**Hazard:**
Clinical system unusable until database restored from backup. If backup is stale or missing, recent patient data may be lost permanently.

**Hazard types:**

- DataLoss
- SystemUnavailable

**Harm:**
Recent patient data lost including clinical notes, medication changes, lab results. Patient receives incorrect treatment due to missing clinical information. Potential for serious harm if critical information (new allergies, medication contraindications) documented in lost data.

**Code associated with hazard:**

- `backend/alembic/env.py`
- `backend/alembic/versions/*.py`
- `Justfile`
