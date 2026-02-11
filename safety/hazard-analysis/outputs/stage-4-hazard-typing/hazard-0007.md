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

**Hazard types:**

- StaleData
- WrongDemographics

**Harm:**
Age-inappropriate medication dosage causing toxicity or inefficacy. Patient identification error leading to wrong-patient treatment or medication administration.

**Code associated with hazard:**

- `frontend/src/pages/Patient.tsx:92-193`
- `frontend/src/components/ribbon/TopRibbon.tsx`
