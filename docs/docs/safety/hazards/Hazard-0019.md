# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

FHIR server health check false negative

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

Startup health check queries FHIR server once during backend startup, but if FHIR container starts after backend, health appears unavailable even though server becomes functional shortly after.

---

## Causes

1. Health check runs on startup event, never re-checks during runtime
2. FHIR container may take 30-60 seconds to fully start
3. Backend starts faster, sees 500 error, logs failure, but continues anyway

---

## Effect

Backend logs "FHIR server not available" but server actually works normally after startup completes.

---

## Hazard

Clinician sees error messages or assumes patient operations unavailable based on logs, uses workaround system or paper-based system, causes data entry duplication.

---

## Hazard type

- Unavailable

---

## Harm

Duplicate patient records created in backup/workaround system. Medical history fragmented across systems causing missed allergies or medication interactions.

---

## Existing controls

None identified during initial analysis.

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

#### Implemented Controls ✓

- **Frontend health polling** ✓: Frontend polls `/api/health` endpoint every 5 seconds until FHIR becomes available. Uses `isFhirReady` state to trigger patient data fetch only after FHIR is confirmed ready. Eliminates false negatives from startup race conditions.
  - Implementation: [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx) lines 242-295
  - Pattern: `useEffect` with `setInterval` polling, clears interval once `isFhirReady=true`

- **Runtime health monitoring** ✓: Backend provides `/api/health` endpoint that checks FHIR availability on every request. Frontend polls this endpoint during initialization and can recheck if patient fetch fails.
  - Implementation: [backend/app/main.py](../../backend/app/main.py) lines 256-286
  - Pattern: `check_fhir_health()` called by `/health` endpoint, returns `{services: {fhir: {available: bool}}}`

- **Actual data access health check** ✓: Backend tests `/Patient?_count=1` instead of just `/metadata` to verify FHIR can actually serve patient data (not just respond to metadata queries). HAPI FHIR returns 200 OK on metadata before search indexes ready, but returns empty array on Patient queries until fully initialized.
  - Implementation: [backend/app/main.py](../../backend/app/main.py) lines 110-139
  - Pattern: `httpx.get(f"{FHIR_SERVER_URL}/Patient?_count=1")`, treats 200 as ready regardless of result count

- **UI state messaging** ✓: Frontend displays "Database is initialising" message (blue alert with clock icon) when FHIR not ready, vs "No patients" message (gray alert with user-off icon) when FHIR ready but empty. StateMessage component provides consistent visual distinction.
  - Implementation: [frontend/src/components/state-message/StateMessage.tsx](../../frontend/src/components/state-message/StateMessage.tsx)
  - Used by: [frontend/src/components/patients/PatientsList.tsx](../../frontend/src/components/patients/PatientsList.tsx) based on `fhirAvailable` prop

- **Conservative readiness tracking** ✓: Frontend uses `useRef` to track if patients have ever loaded with data. Prevents briefly showing "No patients" on navigation when FHIR is actually ready. Only marks FHIR unavailable if patient array empty AND never previously loaded data.
  - Implementation: [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx) lines 216-227
  - Pattern: `hasLoadedPatientsWithData.current` ref, set true when `patients.length > 0`

#### Planned Controls (Not Yet Implemented)

- Startup retry logic with exponential backoff: Backend retries FHIR connection during startup with progressive delays. Status: Planned.

- Docker Compose depends_on with health checks: Use `condition: service_healthy` to prevent backend starting before FHIR ready. Status: Planned.

- Circuit breaker pattern for FHIR unavailability: Switch to degraded mode with cached data after multiple failures. Status: Planned.

- Graceful degradation with 503 responses: Return proper HTTP status codes when FHIR unavailable. Status: Planned.

### Testing controls (manufacturer)

- Integration test: Start backend before FHIR container (simulating race condition), verify health check retries until FHIR ready. Assert no false "FHIR unavailable" errors logged after FHIR becomes healthy.
- Integration test: Stop FHIR container while backend running, wait 90 seconds, restart FHIR. Verify backend detects FHIR down status, displays degraded mode, recovers when FHIR restarts.
- Unit test: Mock FHIR health endpoint to return 500 error first 3 attempts then 200 OK on 4th attempt. Assert health check succeeds after retries, doesn't fail immediately.
- Docker test: Use docker-compose up, verify backend waits for FHIR healthcheck before starting. Assert no race condition during orchestrated startup.

### Training controls (deployment)

- Train IT staff on interpreting health check logs: "Waiting for FHIR" messages during startup are normal, only concern if errors persist >2 minutes.
- Document troubleshooting: If "FHIR unavailable" persists, check FHIR container logs, verify network connectivity, restart FHIR container if needed.

### Business process controls (deployment)

- IT operations runbook: System startup procedure includes verification of all health checks passing before declaring system ready for clinical use.
- Monitoring requirement: Backend /health endpoint must be monitored by external monitoring service (Pingdom, Datadog). Alert if health degraded >5 minutes.
- Incident response: If FHIR unavailability detected, IT must investigate within 15 minutes. Escalate to on-call if service restoration not achieved within 1 hour.

---

## Residual hazard risk assessment

**Partially mitigated (January 2025)**:

- Frontend health polling eliminates race condition on startup - clinicians see "Database initialising" message instead of error logs
- Actual data access testing (`/Patient?_count=1`) prevents false positives from metadata-only checks
- Conservative loading prevents briefly showing "No patients" during navigation
- Residual risk: Backend still starts before FHIR ready (logs warnings), Docker orchestration not yet enforcing startup order
- Residual risk: No circuit breaker for prolonged FHIR outages (no graceful degradation with cached data)

**Next steps for full mitigation**:

1. Add Docker Compose `depends_on: service_healthy` to enforce startup order
2. Implement circuit breaker pattern for prolonged FHIR unavailability
3. Add exponential backoff retry logic to backend startup

---

## Hazard status

Partially mitigated (frontend controls implemented, backend orchestration controls pending)

---

## Code associated with hazard

- [backend/app/main.py](../../backend/app/main.py):110-139 - `check_fhir_health()` tests actual patient data
- [backend/app/main.py](../../backend/app/main.py):256-286 - `/health` endpoint for runtime monitoring
- [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx):242-295 - Health polling useEffect
- [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx):170-235 - Patient fetch with conservative readiness tracking
- [frontend/src/components/state-message/StateMessage.tsx](../../frontend/src/components/state-message/StateMessage.tsx) - UI state messaging component
- [frontend/src/components/patients/PatientsList.tsx](../../frontend/src/components/patients/PatientsList.tsx) - Patient list with fhirAvailable prop
