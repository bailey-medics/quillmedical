# Hazard

**Hazard id:** Hazard-0034

**Hazard name:** API client infinite token refresh loop

**Description:** API client retries request after 401 by refreshing token, but if refresh also fails with 401, potential for infinite redirect loop if login page also makes API calls that fail.

**Causes:**

- Recursive call to request() with retry flag but no maximum retry count
- Login page redirect may happen multiple times
- No circuit breaker to stop retry attempts after certain threshold

**Effect:**
Browser stuck in redirect loop between application and login page, consuming resources and preventing access.

**Hazard:**
Clinician unable to access system during clinical emergency when authentication fails.

**Hazard controls:**

### Design controls (manufacturer)

- Add maxRetries parameter to API client: track retry count in request context. Default maxRetries=1. After first retry fails, throw AuthenticationError and redirect to login once (no further retries). Add retry counter to request metadata: { attempt: 1, maxAttempts: 1 }.
- Implement circuit breaker pattern: after 3 consecutive 401 responses in 60-second window, break circuit and stop all API requests for 30 seconds. Display error banner: "Authentication service unavailable. Please try again in 30 seconds." Prevents infinite retry loops consuming browser resources.
- Add token refresh state management: use singleton refreshTokenPromise to prevent concurrent refresh requests. If token refresh already in progress, subsequent 401 responses wait for existing refresh promise to complete. Prevents multiple simultaneous refresh attempts.
- Implement exponential backoff for retries: first retry immediate, second retry after 1 second, third retry after 3 seconds. Prevents tight retry loop consuming CPU. Max 3 retries then give up and show error message.
- Add degraded mode indicator: when authentication fails repeatedly, display prominent UI banner: "System experiencing authentication issues. If problem persists, contact IT support at [phone]." Provide fallback: allow viewing cached patient list (read-only) without active authentication during authentication outage.

### Testing controls (manufacturer)

- Unit test: Mock api.request to return 401 three times. Call api.get('/patients'). Assert request() called exactly twice (initial + 1 retry), not infinite loop. Assert error thrown after max retries exceeded.
- Integration test: Configure backend to return 401 for all requests (simulate auth service outage). Load frontend, trigger API call. Verify circuit breaker opens after 3 failures. Verify no requests sent for 30 seconds. Verify circuit half-opens after 30 seconds (allows single test request).
- Load test: Simulate 100 users experiencing 401 errors simultaneously. Measure CPU usage, memory usage, network requests. Assert CPU <50%, memory <500MB, request rate <10/second (demonstrates circuit breaker prevents resource exhaustion).
- User acceptance test: Clinician performs workflow (view patients, open letter). Simulate authentication failure mid-workflow. Verify user sees clear error message, option to re-login, and degraded mode banner. Verify no browser freeze or infinite loading.

### Training controls (deployment)

- Train clinicians on authentication failure recovery: if stuck on loading screen or see "authentication error" message, refresh browser page, clear cookies and re-login, or contact IT support if problem persists.
- Document IT support procedures for authentication outage: check backend health, check database connectivity, restart authentication service, verify JWT_SECRET not corrupted, check Caddy reverse proxy logs for errors.

### Business process controls (deployment)

- Monitoring and alerting: Monitor 401 response rate across all API endpoints. Alert operations team if 401 rate exceeds 5% of total requests (indicates widespread authentication issues). Alert triggers within 2 minutes of threshold breach.
- Incident response: During authentication outage, activate degraded mode: allow read-only access to cached patient data. Emergency contacts phone number displayed in UI. Prioritize restoring authentication service (target: <15 minutes downtime).
- Post-incident review: After authentication failure incident, review logs to determine root cause. Common causes: expired JWT_SECRET, database outage, clock skew. Document incident, mitigation steps, and preventive measures.

**Hazard types:**

- SystemUnavailable
- NoAccessToData

**Harm:**
Delayed treatment while clinician attempts to access patient records. Potential patient harm in time-critical situations (stroke, sepsis, cardiac arrest) where delays in accessing clinical information affect treatment decisions.

**Code associated with hazard:**

- `frontend/src/lib/api.ts:56-66`
