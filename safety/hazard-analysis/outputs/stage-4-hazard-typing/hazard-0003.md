# Hazard

**Hazard id:** Hazard-0003

**Hazard name:** Incorrect age calculation

**Description:** Age calculation logic does not correctly handle edge cases including same-day birthdays, leap years, and timezone differences between server (UTC) and browser (local time).

**Causes:**

- Month/day comparison logic error in date calculations
- Timezone mismatch between server birthDate (UTC) and browser Date object (local time)
- Leap year birthday on Feb 29th causing calculation error

**Effect:**
Patient age displayed is incorrect (typically off by one year).

**Hazard:**
Clinician makes age-inappropriate clinical decisions including drug dosage calculations, screening recommendations, and treatment protocols that are age-dependent.

**Hazard types:**

- WrongDemographics
- WrongDrugDose

**Harm:**
Pediatric patient receives adult dosage causing toxicity, or elderly patient misses age-appropriate screening leading to delayed cancer diagnosis. Age-inappropriate medication dosage could cause serious injury or death.

**Code associated with hazard:**

- `frontend/src/pages/Home.tsx:140-151`
- `frontend/src/pages/Patient.tsx:146-157`
