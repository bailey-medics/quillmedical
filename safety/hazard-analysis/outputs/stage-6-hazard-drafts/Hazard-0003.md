# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Incorrect age calculation

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

Age calculation logic does not correctly handle edge cases including same-day birthdays, leap years, and timezone differences between server (UTC) and browser (local time).

---

## Causes

1. Month/day comparison logic error in date calculations
2. Timezone mismatch between server birthDate (UTC) and browser Date object (local time)
3. Leap year birthday on Feb 29th causing calculation error

---

## Effect

Patient age displayed is incorrect (typically off by one year).

---

## Hazard

Clinician makes age-inappropriate clinical decisions including drug dosage calculations, screening recommendations, and treatment protocols that are age-dependent.

---

## Hazard type

- IncorrectResult

---

## Harm

Pediatric patient receives adult dosage causing toxicity, or elderly patient misses age-appropriate screening leading to delayed cancer diagnosis. Age-inappropriate medication dosage could cause serious injury or death.

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

- Replace custom age calculation with date-fns library `differenceInYears()` function which correctly handles all edge cases including leap years and timezone normalization. Parse birthDate as UTC using parseISO() before calculation.
- Add unit tests covering edge cases: birthday today (expect current age), birthday tomorrow (expect current age), Feb 29 leap year birthday (expect correct age in non-leap years), timezone edge cases (UTC midnight vs local time).
- Display age with calculation timestamp: "Age: 45 years (calculated from DOB 1979-02-15 at 2026-02-08 14:30)". Allows clinician to verify calculation freshness.
- Add age validation warning: if calculated age <0 or >150 years, display red warning "Age calculation may be incorrect - verify DOB" and prevent high-risk actions until DOB manually verified.
- Normalize all birthDate values to UTC midnight (00:00:00Z) in FHIR storage to eliminate timezone ambiguity. Store as YYYY-MM-DD string format without time component.

### Testing controls (manufacturer)

- Unit test: Patient with DOB 1980-01-01, test date 2026-02-08, assert age = 46 years. Patient with DOB 1980-02-09 (tomorrow), assert age = 45 years not 46.
- Unit test: Patient born Feb 29, 2000 (leap year), test date Feb 28, 2026 (non-leap), assert age = 25 years. Test on Mar 1, 2026, assert age = 26 years.
- Integration test: Mock system timezone as UTC, browser timezone as UTC+8, patient DOB 2000-01-01, assert age calculated identically in both timezones.
- Unit test: Patient DOB in future (2027-01-01), test date 2026-02-08, assert age displays error warning not negative number. Patient DOB 1800-01-01, assert age >150 warning displays.

### Training controls (deployment)

- Train clinicians to verify age-dependent dosing calculations using multiple sources: check age displayed on screen, manually verify DOB, consult BNF or formulary for weight-based alternative if age seems incorrect.
- Document workflow for pediatric dosing: "Always verify child's age by asking parent/guardian DOB and comparing to screen. If mismatch >1 year, update DOB in system before calculating drug dose."
- Include age verification in clinical handover: "Patient age verified as [X] years, DOB [YYYY-MM-DD] checked against patient wristband/ID."

### Business process controls (deployment)

- NHS Trust pharmacy policy: Pharmacists must independently verify patient age against DOB before dispensing age-dependent medications (pediatric formulations, geriatric dose adjustments).
- Clinical governance requirement: Age-based screening reminders (mammography at 50, colonoscopy at 55, PSA at 50) must include DOB verification step before sending invitation.
- Incident reporting: Any age calculation error leading to wrong dosage or missed screening must be reported as clinical safety incident for root cause analysis.

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- frontend/src/pages/Home.tsx:140-151
- frontend/src/pages/Patient.tsx:146-157
