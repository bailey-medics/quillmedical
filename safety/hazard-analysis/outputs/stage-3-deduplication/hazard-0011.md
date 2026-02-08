# Hazard

**Hazard id:** Hazard-0011

**Hazard name:** Missing letters in list

**Description:** Letters list page displays letters from EHRbase AQL query but does not handle pagination limits or auto-refresh, potentially missing recent letters if query has default row limit or letters created during page load.

**Causes:**

- AQL query may have default row limit (e.g., 100 letters)
- Letters created during page load not shown until manual refresh
- No "refresh" button or auto-refresh mechanism in UI

**Effect:**
Clinician does not see most recent clinical letter in letters list, believes they have reviewed all available clinical information.

**Hazard:**
Critical clinical information in recent letter not reviewed before making clinical decision (e.g., recent consultant letter documenting contraindication).

**Harm:**
Clinician prescribes medication that conflicts with contraindication documented in unseen letter, causing adverse drug reaction or treatment failure.

**Code associated with hazard:**

- `frontend/src/pages/Letters.tsx`
