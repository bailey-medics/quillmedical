# Hazard

**Hazard id:** Hazard-0009

**Hazard name:** Avatar gradient insufficient for patient distinction

**Description:** Avatar gradient colors may not provide sufficient visual distinction for rapid patient identification in high-pressure clinical environment due to limited color variations, color-blind accessibility issues, or display contrast problems.

**Causes:**

- Only 30 gradient variations (0-29) means collisions likely with >30 patients
- Color-blind clinicians cannot distinguish similar hues
- Low contrast on different displays or lighting conditions
- Random generation can assign same gradient to different patients

**Effect:**
Clinician relies on visual color cue but confuses two patients with similar or identical gradient colors.

**Hazard:**
Wrong patient selected based on visual recognition instead of reading name carefully.

**Hazard types:**

- WrongPatient
- WrongPatientContext

**Harm:**
Clinical action performed on wrong patient including medication administration, procedure scheduling, or discharge planning.

**Code associated with hazard:**

- `frontend/src/components/patients/PatientsList.tsx`
- `frontend/src/lib/fhir-patient.ts`
- `backend/app/utils/colors.py`
