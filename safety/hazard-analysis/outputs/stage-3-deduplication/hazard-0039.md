# Hazard

**Hazard id:** Hazard-0039

**Hazard name:** Date format locale assumption

**Description:** Date formatting component uses browser Intl.DateTimeFormat() with default locale, causing date display format to vary based on user's browser settings, creating ambiguity in date interpretation.

**Causes:**

- Intl.DateTimeFormat() uses browser default locale without forcing specific format
- No forced en-GB or hospital-specific date format
- US clinicians see MM/DD/YYYY while UK clinicians see DD/MM/YYYY for same date

**Effect:**
Date interpretation ambiguity where 01/02/2024 could mean February 1st or January 2nd depending on locale.

**Hazard:**
Clinician misreads appointment date, medication start date, or lab result date due to locale format differences.

**Harm:**
Missed appointment causing delayed treatment. Medication taken on wrong dates causing under-dosing or over-dosing. Lab results misinterpreted as older/newer than actual causing incorrect clinical decisions.

**Code associated with hazard:**

- `frontend/src/components/date/Date.tsx`
