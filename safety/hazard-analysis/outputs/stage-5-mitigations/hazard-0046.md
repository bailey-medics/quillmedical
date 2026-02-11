# Hazard

**Hazard id:** Hazard-0046

**Hazard name:** Backend starts before FHIR server ready

**Description:** Docker Compose backend service depends_on FHIR container start but not health status, causing backend to start and accept requests before FHIR server is ready to respond.

**Causes:**

- Backend depends_on fhir without condition: service_healthy
- Backend starts before FHIR server fully initialized
- Initial patient data requests fail until FHIR server ready (30-60 seconds)

**Effect:**
Backend logs errors on startup, patient list and demographics not loadable for first 30-60 seconds after deployment.

**Hazard:**
Clinician thinks system is broken during startup window, uses backup paper system or delays accessing patient data.

**Hazard controls:**

### Design controls (manufacturer)

- Update compose.dev.yml backend service: depends_on.fhir.condition: service_healthy. Docker waits for FHIR health check to pass before starting backend. Ensures FHIR fully ready before backend accepts requests.
- Implement startup readiness probe in backend: /api/ready endpoint checks FHIR connectivity (test query to /fhir/metadata). Returns 503 Service Unavailable until FHIR responds successfully. Caddy health check monitors /api/ready, doesn't route traffic to backend until ready.
- Add retry logic with exponential backoff for FHIR client initialization: on backend startup, attempt FHIR connection. If fails, retry after 1s, 2s, 4s, 8s, 16s (exponential backoff, max 30s between retries). Log "Waiting for FHIR server..." during retries. Only start accepting HTTP requests after FHIR connection successful.
- Implement circuit breaker for FHIR unavailability: if FHIR health check fails 5 consecutive times, open circuit for 60 seconds (stop checking, assume FHIR down). Display error banner in frontend: "Patient data temporarily unavailable. System starting up or FHIR service unavailable." Prevents backend continuously retrying failed FHIR connections.
- Add startup status page: create /api/startup-status endpoint returning JSON with service dependencies status: {"fhir": "ready"|"starting"|"unavailable", "ehrbase": "ready"|..., "database": "ready"|...}. Frontend polls this endpoint, displays progress indicator: "Starting FHIR service (30s remaining)..." Updates user on startup progress.

### Testing controls (manufacturer)

- Integration test: Deploy stack with docker-compose up. Monitor backend logs. Verify backend waits for FHIR health check before starting. Verify no "FHIR connection failed" errors during startup.
- Startup timing test: Deploy stack, measure time until backend /api/ready returns 200 OK. Verify timing consistent (60-90 seconds) and backend doesn't start prematurely. Verify first API request to /api/patients succeeds without FHIR errors.
- FHIR unavailability test: Start backend while FHIR container stopped. Verify backend enters waiting state (logs "Waiting for FHIR server..."). Start FHIR container. Verify backend detects FHIR availability and completes startup within 30 seconds.
- Circuit breaker test: Simulate FHIR server continuously returning 503 errors. Verify backend opens circuit after 5 failures. Verify backend displays "FHIR unavailable" error. Verify circuit half-opens after 60 seconds (allows test request).
- Frontend UX test: Load frontend during backend startup (FHIR not ready). Verify user sees startup progress indicator "System starting up (FHIR service: 30s remaining)." Verify no "failed to load patients" error. Verify patient list loads automatically when startup completes.

### Training controls (deployment)

- Train operations team on startup sequence: explain backend waits for FHIR, typical startup time 60-90 seconds, how to verify health checks passing, troubleshooting steps if startup hangs (check FHIR logs, database connectivity).
- Document expected startup behavior for clinicians: after system restart (e.g., maintenance window), expect 60-90 second delay before system available. Display "System starting up" message during this window. Contact IT support if delay exceeds 5 minutes.

### Business process controls (deployment)

- Maintenance window communication: Before planned restarts (deployments, updates), notify clinicians 24 hours in advance. Provide estimated downtime (5 minutes) and startup delay (90 seconds). Schedule maintenance during low-usage periods (overnight, weekends).
- Startup monitoring: Operations team monitors startup metrics: time to ready, health check failures, dependency initialization time. Alert if startup time exceeds 5 minutes (indicates problem with FHIR, database, or network). Investigate alerts within 10 minutes.
- Graceful shutdown: Before restarting services, initiate graceful shutdown: display "System maintenance in progress" message to active users, complete in-flight requests before stopping containers, flush cached data to databases. Minimizes disruption and data loss.
- Rollback procedure: If deployment fails to start (FHIR health check never passes, backend crashes during startup), automatically rollback to previous version. Document rollback procedure: docker-compose down, revert to previous image tags, docker-compose up. Target: rollback completed within 5 minutes of startup failure detection.

**Hazard types:**

- SystemUnavailable
- NoAccessToData

**Harm:**
Duplicate data entry in backup system causing fragmented medical history. Delayed access to critical patient information during startup window potentially affecting treatment decisions in emergencies.

**Code associated with hazard:**

- `compose.dev.yml`
