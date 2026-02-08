# Hazard

**Hazard id:** Hazard-0010

**Hazard name:** Letter displayed for wrong patient

**Description:** Letter view component fetches letter by composition UID but does not verify letter belongs to current patient in URL context, allowing URL parameter manipulation to display Patient A's letter while viewing Patient B's page.

**Causes:**

- URL parameter manipulation (patient_id and composition_uid mismatch)
- API endpoint does not validate letter ownership against patient_id
- React Router state allows stale patient ID in context

**Effect:**
Letter from Patient A displayed while viewing Patient B's patient detail page or letters list.

**Hazard:**
Clinician reads wrong patient's clinical history and makes treatment decision based on another patient's clinical information.

**Harm:**
Wrong medication prescribed based on another patient's letter (e.g., allergy information from wrong patient causes clinician to avoid safe drug or prescribe contraindicated drug). Patient receives inappropriate treatment based on wrong clinical history.

**Code associated with hazard:**

- `frontend/src/pages/LetterView.tsx`
- `backend/app/schemas/letters.py`
- `backend/app/main.py:650-750`
