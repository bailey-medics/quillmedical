# Hazard

**Hazard id:** Hazard-0002

**Hazard name:** Missing patient demographics not indicated

**Description:** Demographics component returns null when patient data is undefined, causing UI to display blank space instead of clear error indication that patient information failed to load.

**Causes:**

- API fetch fails silently
- Patient ID not found in FHIR server
- Network timeout without retry
- Component returns null for undefined patient with no error indication

**Effect:**
Demographics section shows nothing (blank space) instead of displaying error or alert. Clinician sees empty screen where patient's name, NHS number, and date of birth should appear.

**Hazard:**
Clinician proceeds to view/edit clinical data without knowing which patient they're treating or without confirming they are viewing the correct patient's record.

**Harm:**
Actions taken on wrong patient record. Could result in misdiagnosis, incorrect treatment, or missed critical alerts. Clinician may prescribe medication without verifying patient identity, causing allergic reaction or drug interaction.

**Code associated with hazard:**

- `frontend/src/components/demographics/Demographics.tsx:47-48`
