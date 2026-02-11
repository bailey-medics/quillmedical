# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Letter displayed for wrong patient

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

Letter view component fetches letter by composition UID but does not verify letter belongs to current patient in URL context, allowing URL parameter manipulation to display Patient A's letter while viewing Patient B's page.

---

## Causes

1. URL parameter manipulation (patient_id and composition_uid mismatch)
2. API endpoint does not validate letter ownership against patient_id
3. React Router state allows stale patient ID in context

---

## Effect

Letter from Patient A displayed while viewing Patient B's patient detail page or letters list.

---

## Hazard

Clinician reads wrong patient's clinical history and makes treatment decision based on another patient's clinical information.

---

## Hazard type

- WrongPatient
- IncorrectResult

---

## Harm

Wrong medication prescribed based on another patient's letter (e.g., allergy information from wrong patient causes clinician to avoid safe drug or prescribe contraindicated drug). Patient receives inappropriate treatment based on wrong clinical history.

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

- Add server-side validation in GET /api/patients/{patient_id}/letters/{composition_uid} endpoint: query EHRbase to verify composition belongs to patient's EHR before returning content. If mismatch detected, return 403 Forbidden with error "Letter does not belong to this patient."
- Implement frontend validation: compare patient_id from URL params with patient.id from composition metadata. If mismatch, display red error modal: "Letter/patient mismatch detected. Do not use this information for clinical decisions. Contact IT support."
- Add visual watermark on letter view showing patient name/NHS number from letter composition metadata. Clinician can visually verify letter header matches patient they expect to be viewing.
- Log security event when letter/patient mismatch detected: capture user ID, patient IDs involved, composition UID, timestamp. Alert security team for investigation of potential malicious activity.
- Add React Router navigation guard: before navigating to letter view, pre-fetch letter metadata and verify patient ownership. If mismatch, prevent navigation and display error.

### Testing controls (manufacturer)

- Integration test: Create letter for patient A (FHIR ID "abc123"), manually construct URL for patient B (FHIR ID "xyz789") with patient A's composition UID. Attempt to fetch via API. Assert 403 Forbidden returned, no letter content provided.
- Integration test: Navigate to patient A's letters page, manually edit URL to change patient_id to patient B's ID while keeping composition_uid from patient A. Assert frontend displays error modal, does not render letter content.
- Unit test: Mock LetterView component with mismatched patient_id and composition patientId. Assert error boundary catches mismatch, displays error UI with warning message.
- Security test: Attempt to enumerate letters across patients by iterating patient IDs with known composition UIDs. Assert all requests return 403 errors for mismatched patient/letter combinations.

### Training controls (deployment)

- Train clinicians to always verify patient name banner at top of screen matches expected patient before reading clinical letters or documents.
- Document workflow: "Before reviewing patient's clinical letters, verbally confirm patient name and DOB match expected patient. If mismatch or uncertainty, stop and verify with colleague."
- Include in clinical handover training: "When reviewing patient history, always check patient identifier on every page/document to prevent confusion in multi-patient handovers."

### Business process controls (deployment)

- NHS Trust policy: Clinicians must verify patient identity independently before making treatment decisions based on clinical letters. Do not rely solely on system-displayed patient context.
- Clinical governance: Any detected letter/patient mismatch must be reported as clinical safety incident for investigation. IT must forensically examine for evidence of malicious manipulation or system bug.
- Audit requirement: Monthly security audit sampling random letter access logs, verifying all accessed letters belong to correct patients. Alert on any suspicious patterns of cross-patient letter access.

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- frontend/src/pages/LetterView.tsx
- backend/app/schemas/letters.py
- backend/app/main.py:650-750
