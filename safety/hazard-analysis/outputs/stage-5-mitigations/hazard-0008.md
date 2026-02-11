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

**Hazard controls:**

### Design controls (manufacturer)

- Implement AbortController in fetchPatients function to cancel in-flight requests when component unmounts or new fetch triggered. Store AbortController in useRef, call abort() in cleanup function before starting new fetch.
- Use React Query (TanStack Query) for patient list fetching with built-in request cancellation, caching, and de-duplication. Configure staleTime and cacheTime to prevent unnecessary re-fetches.
- Add request ID/timestamp to each fetch, discard response if request ID doesn't match most recent request. Store latestRequestId in useRef and compare on response arrival.
- Debounce patient list fetches: if multiple re-renders occur within 500ms, only execute final fetch request. Use debounce utility from lodash or custom hook.
- Display loading indicator during fetch with request timestamp: "Loading patients... (request started 14:35:22)". Allows clinician to see if multiple requests are occurring rapidly.

### Testing controls (manufacturer)

- Integration test: Render Home component (patient list), trigger 3 rapid re-renders by changing filter state 3 times within 100ms. Assert only 1 FHIR API request sent (de-duplicated). Verify AbortController cancelled previous requests.
- Unit test: Mock fetchPatients to return response after 2-second delay. Unmount component after 1 second. Assert response from aborted request does not update component state (no setState after unmount warning).
- Integration test: Load patient list, create new patient via API in background, refresh patient list. Assert new patient appears in list. Create second new patient, refresh again, assert both new patients appear (no old response overwriting new data).
- Unit test: Rapid-fire 10 re-renders in 1 second. Assert useEffect cleanup function called 9 times, AbortController.abort() called 9 times before final fetch executes.

### Training controls (deployment)

- Train clinicians to use patient search functionality before creating new patient record. Workflow: "Search by NHS number, name, and DOB before clicking 'Create New Patient' button to avoid duplicates."
- Document escalation procedure: If patient not found in search results but clinician believes they should exist, contact patient registration team to verify before creating new record.
- Include in new user training: "Duplicate patient records cause serious patient safety issues. Always search thoroughly before creating new patient."

### Business process controls (deployment)

- NHS Trust policy: Patient registration team must search by NHS number, name, and DOB across all systems (Quill + PAS + other clinical systems) before creating new patient record.
- Data quality procedure: Weekly automated scan for duplicate patient records (same NHS number, or same name+DOB). Flag duplicates for manual review and merge process.
- Clinical governance: Patient record merge procedure must be documented and audited. Merging records requires senior clinical approval to verify correct merge direction (which record to keep).

**Harm:**
Duplicate patient records created causing fragmented medical history. Allergy documented in one record but not visible in duplicate record, causing clinician to prescribe contraindicated medication leading to anaphylaxis.

**Code associated with hazard:**

- `frontend/src/pages/Home.tsx:105-170`
