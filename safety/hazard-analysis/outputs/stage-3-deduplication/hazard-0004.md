# Hazard

**Hazard id:** Hazard-0004

**Hazard name:** Critical patient identifiers editable without confirmation

**Description:** Detailed demographics form allows editing of critical patient identifiers (NHS number, name, DOB) without confirmation dialog, two-person verification, or "are you sure?" modal before saving.

**Causes:**

- Form submission has no confirmation step
- No audit warning shown to user before critical changes
- Direct API submission without intermediate validation

**Effect:**
Accidental or malicious changes to patient identity saved directly to FHIR server without opportunity for review or reversal.

**Hazard:**
Patient record becomes permanently linked to wrong identity (wrong NHS number, wrong name, wrong DOB) causing patient identification failure.

**Harm:**
Patient's entire medical history lost or merged with another patient. Life-threatening if allergy/medication history becomes incorrect and clinician prescribes contraindicated medication causing anaphylaxis or drug interaction.

**Code associated with hazard:**

- `frontend/src/components/demographics/DemographicsDetailed.tsx`
