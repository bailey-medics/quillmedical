# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Backend starts before FHIR server ready

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

Docker Compose backend service depends_on FHIR container start but not health status, causing backend to start and accept requests before FHIR server is ready to respond.

---

## Causes

1. Backend depends_on fhir without condition: service_healthy
2. Backend starts before FHIR server fully initialized
3. Initial patient data requests fail until FHIR server ready (30-60 seconds)

---

## Effect

Backend logs errors on startup, patient list and demographics not loadable for first 30-60 seconds after deployment.

---

## Hazard

Clinician thinks system is broken during startup window, uses backup paper system or delays accessing patient data.

---

## Hazard type

- WrongPatientContext

---

## Harm

Duplicate data entry in backup system causing fragmented medical history. Delayed access to critical patient information during startup window potentially affecting treatment decisions in emergencies.

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

- **Atomic patient list response with readiness flag** ✓: Backend `/api/patients` endpoint returns `{patients: [...], fhir_ready: bool}` in single atomic response. Eliminates race condition between separate health check and data fetch. Frontend uses `fhir_ready` flag to determine UI state.
  - Implementation: [backend/app/main.py](../../backend/app/main.py) lines 287-320
  - Pattern: Single endpoint returns both data and readiness status, prevents flickering between "loading" and "no patients"

- **Frontend health polling during startup** ✓: Frontend polls `/api/health` every 5 seconds until FHIR available. Displays "Database is initialising" message (blue alert with clock icon) until health check confirms FHIR ready. Prevents "failed to load patients" errors during startup window.
  - Implementation: [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx) lines 242-295
  - Pattern: `useEffect` with `setInterval` polling, stops once `isFhirReady=true`, triggers patient fetch only when ready

- **Conservative FHIR readiness detection** ✓: Frontend tracks whether patient data has ever loaded successfully using `useRef`. Prevents briefly showing "No patients" when navigating back to home page after FHIR confirmed ready. Only shows "Database initialising" if FHIR never seen patient data.
  - Implementation: [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx) lines 216-227
  - Pattern: `hasLoadedPatientsWithData.current` ref, once set true never shows "initialising" again for empty arrays

- **Actual data access health check** ✓: Backend tests `/Patient?_count=1` instead of just `/metadata` to verify FHIR can serve patient resources. HAPI FHIR can return 200 OK on metadata endpoint before search indexes built, causing false positives. Patient query ensures database truly ready.
  - Implementation: [backend/app/main.py](../../backend/app/main.py) lines 110-139
  - Safety note: Documented as "safety-critical" - false positive causes clinicians to think database empty when still loading

- **Skeleton loading UI** ✓: PatientsList component shows animated skeleton UI (gray gradient circles and rectangles with pulse animation) during `isLoading=true`. Visually distinct from "Database initialising" message, indicates active data fetch in progress.
  - Implementation: [frontend/src/components/patients/PatientsList.tsx](../../frontend/src/components/patients/PatientsList.tsx) lines 130-147
  - Pattern: Mantine `Skeleton` components, 3 rows of circle + rectangle, pulse animation

- **StateMessage component for consistent UI messaging** ✓: Extracted reusable StateMessage component for system state displays. Two message types: "database-initialising" (blue, IconClock) and "no-patients" (gray, IconUserOff). Provides consistent visual language across application.
  - Implementation: [frontend/src/components/state-message/StateMessage.tsx](../../frontend/src/components/state-message/StateMessage.tsx)
  - Storybook: [StateMessage.stories.tsx](../../frontend/src/components/state-message/StateMessage.stories.tsx) - Two stories showing both states

- **Automated loading sequence story** ✓: Storybook AnimatedLoadingSequence story demonstrates complete startup flow: health check → database init → fetching → loaded. 30-second loop with state transitions every 5 seconds. Provides visual documentation of expected behavior.
  - Implementation: [frontend/src/components/patients/PatientsList.stories.tsx](../../frontend/src/components/patients/PatientsList.stories.tsx) - AnimatedLoadingSequence story

#### Planned Controls (Not Yet Implemented)

- Update compose.dev.yml backend service: `depends_on.fhir.condition: service_healthy`. Docker waits for FHIR health check before starting backend. Status: Planned.

- Implement startup readiness probe: `/api/ready` endpoint checks FHIR connectivity, returns 503 until ready. Caddy doesn't route traffic until ready. Status: Planned.

- Add retry logic with exponential backoff for FHIR client initialization: Retry after 1s, 2s, 4s, 8s, 16s (max 30s between retries). Log progress messages. Only accept HTTP requests after FHIR connection successful. Status: Planned.

- Implement circuit breaker for FHIR unavailability: Open circuit after 5 consecutive failures, display "Patient data temporarily unavailable" banner. Status: Planned.

- Add startup status page `/api/startup-status`: Returns JSON with all service dependency statuses (FHIR, EHRbase, database). Frontend displays progress indicator. Status: Planned.

### Testing controls (manufacturer)

#### Implemented Testing ✓

- **Storybook visual testing** ✓: AnimatedLoadingSequence story demonstrates complete startup flow with all states (health polling, database initialising, fetching, loaded). Provides visual regression baseline and documentation of expected UX during startup.
  - Story: [PatientsList.stories.tsx](../../frontend/src/components/patients/PatientsList.stories.tsx) - AnimatedLoadingSequence
  - Duration: 30-second loop with 5s per transition state

- **Storybook state message testing** ✓: StateMessage component has dedicated stories showing both "database-initialising" and "no-patients" states. Validates icon, color, and message text consistency.
  - Stories: [StateMessage.stories.tsx](../../frontend/src/components/state-message/StateMessage.stories.tsx)

#### Planned Testing (Not Yet Implemented)

- Integration test: Deploy stack with docker-compose up, monitor backend logs, verify no "FHIR connection failed" errors during startup. Status: Planned.

- Startup timing test: Deploy stack, measure time until backend `/api/ready` returns 200 OK. Verify consistent timing (60-90 seconds). Status: Planned.

- FHIR unavailability test: Start backend while FHIR stopped, verify waiting state, start FHIR, verify recovery within 30 seconds. Status: Planned.

- Circuit breaker test: Simulate FHIR 503 errors, verify circuit opens after 5 failures, displays error, half-opens after 60 seconds. Status: Planned.

- Frontend UX test: Load frontend during FHIR startup, verify "Database is initialising" message shown, verify patient list loads automatically when startup completes. Status: Manual testing performed, automated test planned.

### Training controls (deployment)

- Train operations team on startup sequence: explain backend waits for FHIR, typical startup time 60-90 seconds, how to verify health checks passing, troubleshooting steps if startup hangs (check FHIR logs, database connectivity).
- Document expected startup behavior for clinicians: after system restart (e.g., maintenance window), expect 60-90 second delay before system available. Display "System starting up" message during this window. Contact IT support if delay exceeds 5 minutes.

### Business process controls (deployment)

- Maintenance window communication: Before planned restarts (deployments, updates), notify clinicians 24 hours in advance. Provide estimated downtime (5 minutes) and startup delay (90 seconds). Schedule maintenance during low-usage periods (overnight, weekends).
- Startup monitoring: Operations team monitors startup metrics: time to ready, health check failures, dependency initialization time. Alert if startup time exceeds 5 minutes (indicates problem with FHIR, database, or network). Investigate alerts within 10 minutes.
- Graceful shutdown: Before restarting services, initiate graceful shutdown: display "System maintenance in progress" message to active users, complete in-flight requests before stopping containers, flush cached data to databases. Minimizes disruption and data loss.
- Rollback procedure: If deployment fails to start (FHIR health check never passes, backend crashes during startup), automatically rollback to previous version. Document rollback procedure: docker-compose down, revert to previous image tags, docker-compose up. Target: rollback completed within 5 minutes of startup failure detection.

---

## Residual hazard risk assessment

**Significantly mitigated (January 2025)**:

- Frontend health polling eliminates "failed to load patients" errors during startup - clinicians see clear "Database is initialising" message
- Atomic patient response with `fhir_ready` flag eliminates race conditions and UI flickering
- Conservative readiness tracking prevents false "No patients" display on navigation
- StateMessage component provides consistent, distinguishable visual states (initialising vs empty vs loading)
- Actual data access testing (`/Patient?_count=1`) prevents false positives from metadata-only health checks

**Residual risks**:

- Backend still starts before FHIR ready (logs warnings, but frontend handles gracefully)
- No Docker orchestration enforcement of startup order (`depends_on: service_healthy`)
- No exponential backoff retry logic in backend startup
- No circuit breaker for prolonged FHIR outages
- No `/api/startup-status` progress endpoint (frontend uses `/health` polling instead)

**Impact**: Clinicians see clear startup messaging, no "failed to load" errors, system usable immediately after FHIR ready. Startup UX significantly improved from initial hazard state.

**Next steps for full mitigation**:

1. Add Docker Compose `depends_on: service_healthy` for backend → FHIR dependency
2. Implement `/api/ready` endpoint for Caddy health checks
3. Add exponential backoff retry logic to backend FHIR client initialization
4. Implement circuit breaker pattern for resilience during prolonged outages

---

## Hazard status

Significantly mitigated (frontend and backend detection controls implemented, orchestration controls pending)

---

## Code associated with hazard

- compose.dev.yml - Docker orchestration (pending update for health checks)
- [backend/app/main.py](../../backend/app/main.py):110-139 - `check_fhir_health()` tests actual patient data
- [backend/app/main.py](../../backend/app/main.py):256-286 - `/health` endpoint for runtime monitoring
- [backend/app/main.py](../../backend/app/main.py):287-320 - `/patients` endpoint with atomic `fhir_ready` flag
- [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx):242-295 - Health polling useEffect
- [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx):170-235 - Patient fetch with conservative readiness tracking
- [frontend/src/components/state-message/StateMessage.tsx](../../frontend/src/components/state-message/StateMessage.tsx) - UI state messaging component
- [frontend/src/components/patients/PatientsList.tsx](../../frontend/src/components/patients/PatientsList.tsx) - Patient list with loading states
- [frontend/src/components/patients/PatientsList.stories.tsx](../../frontend/src/components/patients/PatientsList.stories.tsx) - AnimatedLoadingSequence story
- [frontend/src/components/state-message/StateMessage.stories.tsx](../../frontend/src/components/state-message/StateMessage.stories.tsx) - StateMessage stories
