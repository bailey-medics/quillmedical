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

**Hazard types:**

- WrongDemographics
- WrongObservation

**Harm:**
Inappropriate treatment or missed screening. Teratogenic drug given to patient who should be screened for pregnancy. Prostate cancer screening missed for male patient.

**Code associated with hazard:**

- `backend/app/fhir_client.py:120-125`
- `backend/app/fhir_client.py:217`
