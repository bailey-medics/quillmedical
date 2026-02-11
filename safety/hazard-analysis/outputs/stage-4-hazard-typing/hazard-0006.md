# Hazard

**Hazard id:** Hazard-0006

**Hazard name:** Optional patient fields assumed present

**Description:** Patient TypeScript type defines critical fields as optional (dob, age, sex, nationalNumber) but calling code may not handle undefined values safely, leading to runtime errors or missing data.

**Causes:**

- TypeScript optional fields marked with `?` but no runtime checks
- Destructuring without default values
- String interpolation without null checks

**Effect:**
Components display "undefined" text or crash with "cannot read property of undefined" errors. Critical patient information missing when clinician expects it.

**Hazard:**
Critical patient information (DOB for age-based dosing, sex for pregnancy checks, NHS number for external system queries) missing when clinician expects it to be present.

**Hazard types:**

- NoAccessToData
- Incomplete

**Harm:**
Wrong drug dosage calculated due to missing DOB/age. Inappropriate treatment given due to missing sex field (e.g., teratogenic drug given to potentially pregnant patient). Patient identification failure due to missing NHS number.

**Code associated with hazard:**

- `frontend/src/domains/patient.ts:5-19`
