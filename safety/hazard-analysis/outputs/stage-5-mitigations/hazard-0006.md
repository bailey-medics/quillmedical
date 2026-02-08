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

**Hazard controls:**

### Design controls (manufacturer)

- Refactor Patient type to make critical identifiers required (non-optional): `name: string`, `dob: string`, `nationalNumber: string`. Enforce at API boundary that FHIR Patient resources must have these fields before returning to frontend.
- Add runtime validation using Zod schema to validate Patient objects at API response boundary. Throw error if critical fields missing: "Patient record incomplete - missing DOB. Contact IT support."
- Implement safe accessor functions: `getPatientAge(patient)` that returns `number | null` and handles undefined DOB gracefully. Calling code must explicitly check for null return value.
- Add TypeScript strict mode flags: enable `strictNullChecks` and `noUncheckedIndexedAccess` in tsconfig.json to force compile-time checking of optional field access.
- Display placeholder text for missing optional fields: sex field shows "(Not recorded)" rather than blank or "undefined". Use CSS to style missing data differently (gray italic text) so clinician knows information wasn't provided vs didn't load.

### Testing controls (manufacturer)

- Unit test: Create Patient object with dob=undefined, pass to age calculation function. Assert function returns null or displays "Age unknown" message, does not crash with undefined error.
- Unit test: Render Demographics component with patient missing nationalNumber field. Assert component displays "(NHS number not recorded)" placeholder text not "undefined" string.
- Integration test: Mock FHIR API to return Patient resource without sex field. Assert frontend handles gracefully, displays placeholder, does not crash with "cannot read property 'sex'" error.
- TypeScript compile test: Attempt to access patient.dob without null check. Assert TypeScript compiler error raised when strictNullChecks enabled.

### Training controls (deployment)

- Train clinicians to verify all required patient fields are populated before high-risk clinical actions. Document escalation: if DOB, sex, or NHS number missing, complete demographics before proceeding with prescribing or ordering.
- Workflow training: "If you see '(Not recorded)' placeholder for critical field, you must obtain information from patient/wristband/registration before continuing clinical workflow."
- Include in medication prescribing training: "Never calculate drug dosages if patient age/weight shows as 'Not recorded'. Obtain accurate measurements before prescribing."

### Business process controls (deployment)

- NHS Trust policy: Patient registration must be 100% complete (name, DOB, sex, NHS number) before patient can be seen by clinician. Registration staff must not submit incomplete demographics.
- Clinical governance: Pharmacy must reject prescriptions for patients with incomplete demographics (missing DOB for age verification, missing sex for pregnancy-related checks).
- Data quality audit: Monthly audit sampling 100 patient records checking for completeness of critical demographic fields. Identify patterns of missing data for targeted staff training.

**Harm:**
Wrong drug dosage calculated due to missing DOB/age. Inappropriate treatment given due to missing sex field (e.g., teratogenic drug given to potentially pregnant patient). Patient identification failure due to missing NHS number.

**Code associated with hazard:**

- `frontend/src/domains/patient.ts:5-19`
