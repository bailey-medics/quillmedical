# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Missing patient demographics not indicated

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

Demographics component returns null when patient data is undefined, causing UI to display blank space instead of clear error indication that patient information failed to load.

---

## Causes

1. API fetch fails silently
2. Patient ID not found in FHIR server
3. Network timeout without retry
4. Component returns null for undefined patient with no error indication

---

## Effect

Demographics section shows nothing (blank space) instead of displaying error or alert. Clinician sees empty screen where patient's name, NHS number, and date of birth should appear.

---

## Hazard

Clinician proceeds to view/edit clinical data without knowing which patient they're treating or without confirming they are viewing the correct patient's record.

---

## Hazard type

- WrongPatientContext

---

## Harm

Actions taken on wrong patient record. Could result in misdiagnosis, incorrect treatment, or missed critical alerts. Clinician may prescribe medication without verifying patient identity, causing allergic reaction or drug interaction.

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

- Replace null return with error state component displaying red alert box with text "Patient demographics failed to load. Please refresh page or contact IT support." Include retry button and patient ID in error message.
- Add React Query error boundary with automatic retry logic (3 retries with exponential backoff: 1s, 2s, 4s delays) for FHIR patient fetch requests. Display loading spinner during retries with attempt counter.
- Implement skeleton loading state with gray placeholder boxes for name, DOB, NHS number fields while data loads. Show animated pulse effect to indicate loading in progress.
- Add telemetry logging when patient fetch fails: log FHIR server response status, patient ID, timestamp, user ID to backend error tracking service for debugging.
- Display watermark "DEMOGRAPHICS MISSING" diagonally across patient page if demographics undefined after all retry attempts exhaust, preventing clinician from proceeding without clear warning.

### Testing controls (manufacturer)

- Integration test: Mock FHIR API to return 404 Not Found for patient ID, render Demographics component, assert red error box displays with message "Patient demographics failed to load". Test should fail if blank space shown.
- Integration test: Mock FHIR API to return 500 Server Error, verify component displays error message not blank screen. Assert retry button present and functional.
- Unit test: Render Demographics with patient=undefined prop, assert component renders error state not null. Verify no console.error warnings about missing required props.
- Integration test: Mock network timeout (>30 seconds), verify loading spinner displays during timeout, error message displays after timeout, retry button allows manual retry.

### Training controls (deployment)

- Train clinicians to never proceed with clinical actions if patient demographics section is blank or shows error. Document escalation procedure: refresh page, log out and back in, contact IT support.
- Include in clinical workflow training: "If you cannot see patient name, DOB, and NHS number clearly displayed, STOP and do not proceed with documentation or ordering."
- Post visual reminder near clinical workstations: "No patient details = NO clinical actions. Refresh or contact IT."

### Business process controls (deployment)

- NHS Trust policy: Clinicians must not document in patient record or prescribe medications if patient identity fields are not visible on screen. Policy must specify escalation path to IT support.
- Incident reporting requirement: Any instance of missing patient demographics must be reported as clinical safety incident via Datix or equivalent system for investigation.
- IT support SLA: Missing patient demographics reported as Priority 1 incident requiring response within 15 minutes.

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- frontend/src/components/demographics/Demographics.tsx:47-48
