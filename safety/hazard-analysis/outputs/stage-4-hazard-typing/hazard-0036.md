# Hazard

**Hazard id:** Hazard-0036

**Hazard name:** Service worker caches stale patient data

**Description:** Service worker may implement cache-first or stale-while-revalidate strategy for API responses, serving stale demographics when offline or on slow network without staleness warning.

**Causes:**

- Cache-first strategy serves cached content without checking freshness
- No cache invalidation on patient update events
- Offline mode serves cached data without visual indication that data may be stale

**Effect:**
Clinician views outdated patient demographics (name, DOB, NHS number) when offline or on slow network, believing information is current.

**Hazard:**
Clinical decision based on wrong demographics including age-inappropriate dosing calculations or patient identification errors.

**Hazard types:**

- StaleData
- WrongDemographics

**Harm:**
Age-inappropriate medication dosage causing toxicity or treatment failure. Emergency contact called for wrong patient. Patient receives treatment intended for different individual.

**Code associated with hazard:**

- `frontend/public/sw.js`
