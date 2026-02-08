# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Date format locale assumption

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

Date formatting component uses browser Intl.DateTimeFormat() with default locale, causing date display format to vary based on user's browser settings, creating ambiguity in date interpretation.

---

## Causes

1. Intl.DateTimeFormat() uses browser default locale without forcing specific format
2. No forced en-GB or hospital-specific date format
3. US clinicians see MM/DD/YYYY while UK clinicians see DD/MM/YYYY for same date

---

## Effect

Date interpretation ambiguity where 01/02/2024 could mean February 1st or January 2nd depending on locale.

---

## Hazard

Clinician misreads appointment date, medication start date, or lab result date due to locale format differences.

---

## Hazard type

- WrongPatientContext

---

## Harm

Missed appointment causing delayed treatment. Medication taken on wrong dates causing under-dosing or over-dosing. Lab results misinterpreted as older/newer than actual causing incorrect clinical decisions.

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

- Force en-GB locale for all date displays: Intl.DateTimeFormat('en-GB', {day: '2-digit', month: '2-digit', year: 'numeric'}). Displays dates consistently as DD/MM/YYYY format regardless of browser settings. Add date format explanation to UI: "All dates shown as DD/MM/YYYY (day/month/year)."
- Implement ISO 8601 date display for clarity: display dates as YYYY-MM-DD (ISO format) which is unambiguous across all locales. Example: 2024-02-01 can only mean 1st February 2024. Use in all clinical contexts where date confusion could cause harm.
- Add month name display for critical dates: instead of 01/02/2024, display "1 Feb 2024" or "01-Feb-2024". Eliminates ambiguity by spelling out month name. Use for medication dates, lab result dates, appointment dates.
- Implement date format configuration per trust: add hospital_date_format to system configuration. Options: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD. Administrator configures preferred format during deployment. All users see same format (no per-user variation).
- Add hover tooltip with full date spelling: when hovering over date, display tooltip "1st February 2024" (fully spelled out). Provides confirmation for clinicians uncertain about format. Works for all numerical date displays.

### Testing controls (manufacturer)

- Unit test: Set browser locale to en-US. Render Date component with value="2024-02-01". Assert output is "01/02/2024" (en-GB format forced). Repeat with en-GB, de-DE, fr-FR locales. Assert output always "01/02/2024" regardless of browser locale.
- Visual test: Screenshot test comparing date displays across different browser locales. Assert all screenshots identical (consistent formatting across locales).
- Integration test: Create patient with DOB "2000-03-04". Load patient card. Assert DOB displayed as "04/03/2000" (en-GB format) or "4 Mar 2000" (month name format). Parse displayed date. Assert equals 4th March 2000.
- Accessibility test: Render date with hover tooltip. Simulate hover event. Assert tooltip displays "4th March 2000". Verify screen reader announces full date including month name.
- Configuration test: Set hospital_date_format="YYYY-MM-DD" in config. Render dates. Assert all dates display as YYYY-MM-DD. Change config to "DD/MM/YYYY". Restart application. Assert dates display as DD/MM/YYYY.

### Training controls (deployment)

- Train clinical staff on date format used in system: explain system displays dates as DD/MM/YYYY (day/month/year) or with month names (1 Feb 2024). Provide examples. Test understanding with quiz questions.
- Document date format in user manual: first page of user manual states "All dates in this system are displayed as DD/MM/YYYY (day/month/year). For example, 01/02/2024 means 1st February 2024, not 2nd January." Include prominent notice.

### Business process controls (deployment)

- Date format standardization policy: All clinical systems in trust must use same date format. Document preferred format in IT policies. Configure all systems (EHR, lab systems, pharmacy, radiology) with same format.
- Date verification procedure: For high-risk clinical decisions involving dates (medication start/stop, surgery scheduling, lab result interpretation), clinician must verbally confirm date with second person. Example: "Patient's surgery is scheduled for the first of February, correct?"
- Incident reporting: Require staff to report cases where date format confusion caused near-miss or adverse event. Analyze reports quarterly. If reports >2/year, consider changing to unambiguous format (ISO 8601 or month names).
- Patient-facing communication: When dates communicated to patients (appointment letters, medication schedules), spell out month name. Example: "Your appointment is on 1 February 2024" not "01/02/2024". Reduces patient confusion.
- WrongObservation
- WrongObservationInterpretation

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- frontend/src/components/date/Date.tsx
