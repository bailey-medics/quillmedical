# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Service worker caches stale patient data

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

Service worker may implement cache-first or stale-while-revalidate strategy for API responses, serving stale demographics when offline or on slow network without staleness warning.

---

## Causes

1. Cache-first strategy serves cached content without checking freshness
2. No cache invalidation on patient update events
3. Offline mode serves cached data without visual indication that data may be stale

---

## Effect

Clinician views outdated patient demographics (name, DOB, NHS number) when offline or on slow network, believing information is current.

---

## Hazard

Clinical decision based on wrong demographics including age-inappropriate dosing calculations or patient identification errors.

---

## Hazard type

- WrongPatientContext
- Delayed
- IncorrectResult

---

## Harm

Age-inappropriate medication dosage causing toxicity or treatment failure. Emergency contact called for wrong patient. Patient receives treatment intended for different individual.

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

- Implement network-first caching strategy (not cache-first) for patient demographics API calls: service worker always attempts network request first, falls back to cache only if network unavailable. Add Cache-Control: max-age=300 header to demographics responses (5-minute freshness).
- Add cache timestamp metadata: when caching API response, store timestamp in cache entry. Service worker checks age before serving cached data. If cached data >5 minutes old, display staleness warning banner: "Patient data may be out of date. Last updated: [timestamp]. Refresh when online."
- Implement cache invalidation on update events: when patient demographics updated via PUT /api/patients/{id}/demographics, broadcast message to service worker via postMessage() API. Service worker deletes cached entry for that patient, forcing fresh network request on next access.
- Add visual staleness indicators in UI: when serving cached data, display yellow warning icon next to patient name with tooltip "Using cached data from [timestamp]. May not reflect recent changes." Prominent "Refresh Data" button that forces cache bypass.
- Implement offline mode banner: detect navigator.onLine=false state. Display persistent banner at top of UI: "Offline mode: Viewing cached patient data. Changes will sync when connection restored." Different styling from online mode (grey background instead of white).

### Testing controls (manufacturer)

- Unit test: Mock service worker to return cached response with timestamp 10 minutes ago. Render patient card. Assert staleness warning banner displayed with text "Last updated: 10 minutes ago".
- Integration test: Load patient demographics while online. Go offline (navigator.onLine=false). Navigate to different patient. Assert cached data displayed with offline banner. Go online. Assert fresh data fetched and banner removed.
- Cache expiry test: Cache patient demographics. Wait 6 minutes (or mock time). Request same demographics. Assert service worker attempts network request first (cache expired). If network fails, assert cached data served with staleness warning.
- Update invalidation test: Cache patient A demographics. Update patient A via PUT request. Request patient A demographics again. Assert service worker fetches fresh data from network (cache invalidated by update event).
- Visual test: Screenshot test comparing online mode vs offline mode. Assert offline mode has visible banner, staleness indicator icons, different styling.

### Training controls (deployment)

- Train clinicians on offline mode limitations: cached data may be stale, always verify critical demographics when online, do not rely on cached data for high-risk decisions (e.g., blood transfusion, surgery).
- Document refresh procedure for clinical staff: if suspicious demographics are stale, click "Refresh Data" button or reload browser page while online. Wait for network request to complete before proceeding with clinical decision.

### Business process controls (deployment)

- Clinical policy: Cached patient data acceptable for low-risk read-only viewing during network outages. High-risk procedures (medication administration, surgery, blood transfusion) require online verification of demographics. Never proceed with high-risk intervention using cached data.
- Network reliability monitoring: Track percentage of time system online vs offline. Alert operations team if offline >10% of time (indicates network infrastructure problem). Target: >99.5% uptime.
- Cache policy documentation: document cache TTL (5 minutes), staleness warning thresholds, cache invalidation triggers. Review annually. Adjust TTL based on demographic update frequency.
- Incident reporting: Require clinicians to report cases where stale cached data caused confusion or near-miss. Analyze reports quarterly. Adjust staleness warning prominence if reports >1/month.
- StaleData
- WrongDemographics

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- frontend/public/sw.js
