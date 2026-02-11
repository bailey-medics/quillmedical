# Hazard

**Hazard id:** Hazard-0001

**Hazard name:** Wrong patient identity displayed

**Description:** Patient demographics (name, DOB, NHS number) displayed in UI do not match the actual patient record being viewed due to React rendering race conditions, state management bugs, or component key collisions.

**Causes:**

- Race condition where patient prop updates but stale data renders before React reconciliation
- Parent component passes wrong patient object due to state management bug
- React key collision causing incorrect component instance to display
- React closure captures patient.id from props at render time but list re-sorts/filters between mouse-down and mouse-up
- Patient state stored in component state rather than React Router loader, lost on navigation

**Effect:**
Clinician sees wrong patient's demographics (name, DOB, NHS number) in UI components including demographics cards, ribbons, and patient list items.

**Hazard:**
Clinician makes clinical decision based on wrong patient identity, believing they are viewing one patient's record while actually viewing another.

**Harm:**
Wrong patient receives treatment/medication/procedure. Potential for serious injury or death if high-risk intervention (surgery, chemotherapy, insulin administration). Wrong patient discharged, medications reviewed for incorrect patient.

**Code associated with hazard:**

- `frontend/src/components/demographics/Demographics.tsx:49-78`
- `frontend/src/pages/Home.tsx:213-231`
- `frontend/src/components/ribbon/TopRibbon.tsx`
- `frontend/src/RootLayout.tsx`
