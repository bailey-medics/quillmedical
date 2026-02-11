# Hazard

**Hazard id:** Hazard-0041

**Hazard name:** Database connection pool exhaustion

**Description:** SQLAlchemy connection pool has default limits (pool_size=5) which may be insufficient for production load, causing new API requests to wait for connections or timeout.

**Causes:**

- No explicit pool_size or max_overflow configuration in engine creation
- Default pool_size=5 insufficient for concurrent production load
- Long-running transactions hold connections preventing new requests
- No connection pool monitoring or alerting

**Effect:**
New API requests wait for available database connection, timeout, or fail with connection pool exhausted errors.

**Hazard:**
Clinician unable to access patient data during high load periods (ward rounds, emergency situations with multiple concurrent users).

**Hazard types:**

- SystemUnavailable
- NoAccessToData

**Harm:**
Delayed treatment while clinician waits for system to respond or uses backup paper system. Potential patient harm in time-critical situations where rapid access to clinical information affects treatment decisions.

**Code associated with hazard:**

- `backend/app/db/auth_db.py`
