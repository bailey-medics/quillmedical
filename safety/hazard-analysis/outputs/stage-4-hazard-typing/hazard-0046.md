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

**Hazard types:**

- SystemUnavailable
- NoAccessToData

**Harm:**
Duplicate data entry in backup system causing fragmented medical history. Delayed access to critical patient information during startup window potentially affecting treatment decisions in emergencies.

**Code associated with hazard:**

- `compose.dev.yml`
