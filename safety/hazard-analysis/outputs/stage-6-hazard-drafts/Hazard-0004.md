# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Critical patient identifiers editable without confirmation

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

Detailed demographics form allows editing of critical patient identifiers (NHS number, name, DOB) without confirmation dialog, two-person verification, or "are you sure?" modal before saving.

---

## Causes

1. Form submission has no confirmation step
2. No audit warning shown to user before critical changes
3. Direct API submission without intermediate validation

---

## Effect

Accidental or malicious changes to patient identity saved directly to FHIR server without opportunity for review or reversal.

---

## Hazard

Patient record becomes permanently linked to wrong identity (wrong NHS number, wrong name, wrong DOB) causing patient identification failure.

---

## Hazard type

- IncorrectResult

---

## Harm

Patient's entire medical history lost or merged with another patient. Life-threatening if allergy/medication history becomes incorrect and clinician prescribes contraindicated medication causing anaphylaxis or drug interaction.

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

- Add confirmation modal when NHS number, name, or DOB fields are modified. Modal must display old value and new value side-by-side with red highlight: "NHS number changing from 123 456 7890 to 987 654 3210. Are you sure? This cannot be undone." Require explicit "Confirm Change" button click.
- Implement two-stage save for critical identifier changes: first save marks record as "pending verification", second clinician must independently verify and approve change before it becomes active in FHIR server.
- Add change reason text field (required) when modifying NHS number/name/DOB: "Why are you making this change?" with minimum 10 character description. Reason stored in audit log.
- Display banner warning before form submission: "Warning: You are about to change critical patient identifiers. Incorrect changes can cause serious patient harm. Please verify all information carefully."
- Add "undo" feature: store previous identifier values in separate FHIR extension for 24 hours, allow reverting change within 24-hour window with administrator approval.

### Testing controls (manufacturer)

- Integration test: Load patient demographics form, change NHS number from "123 456 7890" to "987 654 3210", click Save. Assert confirmation modal displays with both values shown. Click Cancel, assert NHS number reverts to original. Click Confirm, assert API PUT request sent with new NHS number.
- Unit test: Render DemographicsDetailed form, modify name field, attempt submit without filling reason field. Assert form validation prevents submission with error message "Please provide reason for changing patient name."
- Integration test: Change DOB field, verify confirmation modal shows old DOB and new DOB in different colors. Verify modal cannot be dismissed without explicit choice (Confirm or Cancel).
- Integration test: Submit critical identifier change, verify change reason stored in audit log with timestamp and user ID.

### Training controls (deployment)

- Train clinicians to never change NHS number unless error documented and verified against patient wristband, photo ID, or NHS Spine query. Document verification procedure: check NHS number against at least two independent sources before changing.
- Provide workflow training: "If patient's NHS number appears incorrect, first verify with patient registration team and NHS Spine before making any system changes. Document verification source in change reason field."
- Include in induction training: Changing patient identifiers is high-risk activity requiring supervisor approval. Emphasize potential for serious harm from incorrect identity.

### Business process controls (deployment)

- NHS Trust policy: Changes to NHS number, name, or DOB require two-person verification. Second clinician must independently verify patient identity using photo ID, wristband, and NHS Spine query before approving change.
- Clinical governance requirement: All critical identifier changes must be logged in incident reporting system as "near miss" for trending analysis even if correct change made.
- Policy: Administrators have 24-hour audit window to review all identifier changes. Any suspicious pattern (multiple changes by same user, changes without documented reason) triggers investigation.
- IT policy: Database backups retained for 30 days specifically to enable recovery from incorrect identifier changes if discovered after 24-hour undo window expires.

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- frontend/src/components/demographics/DemographicsDetailed.tsx
