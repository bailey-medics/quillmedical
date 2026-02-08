# Hazard

**Hazard id:** Hazard-0013

**Hazard name:** Invalid FHIR gender value

**Description:** Gender input converted to lowercase without proper validation against FHIR R4 required values (male|female|other|unknown), potentially allowing invalid values to be stored.

**Causes:**

- Input converted to .lower() but typos like "femail" pass lowercase conversion
- No validation against FHIR R4 enum before submission
- FHIR server may reject or silently store invalid value

**Effect:**
Invalid gender value submitted to FHIR server, either rejected causing error or stored incorrectly.

**Hazard:**
Gender-specific clinical rules not applied correctly (pregnancy checks for "female" patients, prostate screening for "male" patients).

**Hazard controls:**

### Design controls (manufacturer)

- Add Pydantic validator in backend schemas enforcing FHIR R4 gender enum before API submission. Use Literal["male", "female", "other", "unknown"] type annotation. Reject any value not in enum with 400 error: "Invalid gender value. Must be one of: male, female, other, unknown."
- Replace free-text gender input with dropdown/radio button selection in frontend forms providing only valid options. Prevents typos entirely by not allowing text entry.
- Add frontend TypeScript enum matching FHIR gender values: `enum FHIRGender { MALE = "male", FEMALE = "female", OTHER = "other", UNKNOWN = "unknown" }`. Enforce at compile time.
- Implement backend validation middleware that checks all FHIR resources before submission, verifying gender field matches FHIR R4 specification. Log validation failures for debugging.
- Add data migration script to scan existing FHIR patients, identify any with invalid gender values, update to "unknown" with audit log entry documenting correction.

### Testing controls (manufacturer)

- Unit test: Attempt to create patient with gender="femail" via API. Assert 400 Bad Request returned with error message specifying valid values. Verify no FHIR resource created.
- Unit test: Test each valid gender value (male, female, other, unknown) successfully creates patient. Test capitalized inputs ("Male", "FEMALE") are normalized to lowercase correctly.
- Integration test: Mock FHIR server to reject invalid gender, verify backend catches rejection and returns meaningful error to frontend instead of generic 500 error.
- Unit test: Test edge cases: null gender, empty string gender, numeric gender value. Assert all invalid inputs rejected at Pydantic validation layer.

### Training controls (deployment)

- Train registration staff on importance of accurate gender documentation for clinical decision support (pregnancy checks, cancer screening).
- Document workflow: "If patient's gender not easily categorized as male/female, select 'other' and document details in clinical notes. Use 'unknown' only when patient unable/unwilling to provide information."
- Include in diversity training: Explain difference between sex assigned at birth (biological), gender identity (self-identification), and clinical sex (for medical purposes). Document sensitivity when asking questions.

### Business process controls (deployment)

- NHS Trust policy: Gender must be documented for all patients at registration. Registration incomplete without gender field populated.
- Clinical governance: Gender-specific clinical decision support rules (pregnancy screening for females 12-55) must account for 'other' and 'unknown' values by prompting clinician for manual assessment.
- Data quality audit: Monthly scan for patients with 'unknown' gender, review cases to determine if information can be obtained and updated through clinical contact.

**Harm:**
Inappropriate treatment or missed screening. Teratogenic drug given to patient who should be screened for pregnancy. Prostate cancer screening missed for male patient.

**Code associated with hazard:**

- `backend/app/fhir_client.py:120-125`
- `backend/app/fhir_client.py:217`
