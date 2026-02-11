# Hazard

**Hazard id:** Hazard-0008

**Hazard name:** Patient list race condition

**Description:** Multiple rapid API calls to `/patients` endpoint can cause race condition where older response overwrites newer data, or component re-renders trigger duplicate fetches with cleanup flag that doesn't prevent promise settlement.

**Causes:**

- fetchPatients function does not cancel in-flight HTTP requests
- Component re-renders trigger duplicate fetches
- useEffect cleanup sets `cancelled = true` but fetch promise still settles after cleanup

**Effect:**
Patient list shows stale data (missing newly added patient or showing deleted patient).

**Hazard:**
Clinician cannot find patient in list and assumes they don't exist in system, proceeds to create duplicate record with different FHIR ID.

**Harm:**
Duplicate patient records created causing fragmented medical history. Allergy documented in one record but not visible in duplicate record, causing clinician to prescribe contraindicated medication leading to anaphylaxis.

**Code associated with hazard:**

- `frontend/src/pages/Home.tsx:105-170`
