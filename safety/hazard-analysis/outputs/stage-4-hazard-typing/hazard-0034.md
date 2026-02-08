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

**Hazard types:**

- SystemUnavailable
- NoAccessToData

**Harm:**
Delayed treatment while clinician attempts to access patient records. Potential patient harm in time-critical situations (stroke, sepsis, cardiac arrest) where delays in accessing clinical information affect treatment decisions.

**Code associated with hazard:**

- `frontend/src/lib/api.ts:56-66`
