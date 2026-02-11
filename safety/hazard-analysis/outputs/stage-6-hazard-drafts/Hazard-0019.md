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

- Implement retry logic in startup health check: attempt FHIR query every 5 seconds for up to 120 seconds before logging failure. Log "Waiting for FHIR server... attempt 3/24" progress messages.
- Add runtime health monitoring: periodic FHIR health checks every 60 seconds during operation. Update health status indicator in backend /health endpoint. Allow frontend to display system status to users.
- Use Docker Compose depends_on with condition: service_healthy for backend -> fhir dependency. Backend container only starts after FHIR healthcheck passes, eliminating race condition.
- Add circuit breaker pattern: if FHIR health check fails, switch to degraded mode. Display warning banner in UI: "Patient demographics temporarily unavailable - using cached data" until health restored.
- Implement graceful degradation: if FHIR unavailable at startup, backend continues running but returns 503 Service Unavailable for patient endpoints with retry-after header, rather than crashing.

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

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- backend/app/main.py:158-186
