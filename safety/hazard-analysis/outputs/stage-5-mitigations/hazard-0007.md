# Hazard

**Hazard id:** Hazard-0007

**Hazard name:** Stale patient demographics after external update

**Description:** Patient page and demographics components fetch data on mount but never re-fetch if another user updates demographics in parallel session, causing clinician to view outdated information.

**Causes:**

- useEffect dependency array only includes static values, no polling
- No WebSocket subscription for real-time updates
- React Router navigation reuses component instance without re-mount
- Patient object passed via context is cached without refresh mechanism

**Effect:**
Clinician views outdated patient name, DOB, NHS number, or other demographics while another clinician has corrected errors or updated information in parallel.

**Hazard:**
Clinician makes decision based on incorrect demographics (wrong age causing age-inappropriate dosing, wrong identity causing patient confusion).

**Hazard controls:**

### Design controls (manufacturer)

- Implement WebSocket subscription for patient demographics updates. When patient record updated in FHIR server, broadcast update event to all connected clients viewing that patient. Frontend invalidates React Query cache and re-fetches demographics automatically.
- Add polling mechanism with React Query: refetch patient demographics every 30 seconds while patient page is active. Use `refetchInterval: 30000` in useQuery hook configuration.
- Display "last updated" timestamp next to demographics: "Patient demographics last refreshed: 2026-02-08 14:35:22". Include manual refresh button allowing clinician to force immediate re-fetch.
- Add visual indicator when demographics are stale (>5 minutes old without refresh): display orange banner "Patient data may be outdated. Last refreshed [timestamp]." Include prominent "Refresh now" button.
- Implement optimistic locking with version numbers: include FHIR resource version in frontend cache. On save attempt, check if version changed. If so, display "Demographics changed by another user" conflict modal showing both versions side-by-side.

### Testing controls (manufacturer)

- Integration test: Open patient A demographics in browser window 1, update DOB in browser window 2, verify browser window 1 receives WebSocket event and automatically re-renders with new DOB within 2 seconds.
- Integration test: Open patient page, wait 60 seconds (>2 polling intervals). Verify two FHIR fetch requests logged in network tab showing automatic polling behavior.
- Unit test: Render Demographics component with lastUpdated timestamp of 6 minutes ago. Assert orange staleness warning banner displayed. Click refresh button, assert new API fetch triggered.
- Integration test: Mock WebSocket connection failure (offline mode). Verify polling fallback continues to refresh demographics every 30 seconds using HTTP requests.

### Training controls (deployment)

- Train clinicians to always check "Last updated" timestamp before critical decisions. Workflow training: "Before prescribing high-risk medications, click Refresh button to ensure demographics are current."
- Document clinical handover workflow: "When handing over patient care, verbally confirm key demographics (name, DOB, allergies) and refresh screen to verify no changes made by other team members."
- Include in medication reconciliation training: "Always refresh patient demographics at start of medication review to ensure allergy list and medication history are up-to-date."

### Business process controls (deployment)

- NHS Trust policy: Clinical workstations must not be left logged in displaying patient data for extended periods without activity. Implement screen timeout after 5 minutes of inactivity requiring re-authentication and data refresh.
- Clinical governance: Before high-risk procedures (surgery, chemotherapy), clinician must manually refresh patient demographics and verbally verify with patient/family that displayed information is correct.
- IT policy: WebSocket server infrastructure must have 99.9% uptime SLA. Monitor WebSocket connection failures and alert if >1% of clients failing to maintain real-time connection.

**Harm:**
Age-inappropriate medication dosage causing toxicity or inefficacy. Patient identification error leading to wrong-patient treatment or medication administration.

**Code associated with hazard:**

- `frontend/src/pages/Patient.tsx:92-193`
- `frontend/src/components/ribbon/TopRibbon.tsx`
