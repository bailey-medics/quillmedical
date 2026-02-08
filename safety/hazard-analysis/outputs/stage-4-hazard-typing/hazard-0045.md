# Hazard

**Hazard id:** Hazard-0045

**Hazard name:** Docker containers lack resource limits

**Description:** Docker Compose file defines resource limits for database containers but not for backend/frontend containers, allowing runaway processes to consume all host resources.

**Causes:**

- Backend service has no mem_limit or cpus configuration
- Runaway process (memory leak, infinite loop) can consume all host RAM/CPU
- No OOM killer threshold or CPU quotas

**Effect:**
Backend container consumes all host RAM or CPU, causing entire system to freeze or crash.

**Hazard:**
Clinical system becomes unavailable until manual restart by IT staff, clinicians cannot access patient data.

**Hazard types:**

- SystemCrash
- SystemUnavailable

**Harm:**
Delayed treatment while system is down. Potential patient harm in emergencies where rapid access to clinical information affects treatment decisions. Clinicians forced to use backup paper system causing data fragmentation.

**Code associated with hazard:**

- `compose.dev.yml`
