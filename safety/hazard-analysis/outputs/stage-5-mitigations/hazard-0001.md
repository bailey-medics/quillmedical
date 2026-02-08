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

**Hazard controls:**

### Design controls (manufacturer)

- Add React key prop using stable patient FHIR ID (`patient.id`) to all patient-related components to prevent component instance reuse. Ensure PatientsList, Demographics, TopRibbon components use `key={patient.id}` when rendering.
- Store patient context in React Router loader data (loaderData) instead of component state. Load patient data in route loader function, pass via useLoaderData() hook to persist across navigation and prevent stale closures.
- Add patient identifier verification banner at top of patient detail pages displaying NHS number in large bold font with colored border, requiring clinician to visually verify before clinical actions.
- Implement React ErrorBoundary around patient components with fallback UI displaying "Patient data mismatch detected. Please refresh." message if patient.id doesn't match URL parameter.
- Add useEffect hook with abort controller in patient-fetching components to cancel in-flight requests when component unmounts or patient ID changes, preventing race condition responses from updating state.

### Testing controls (manufacturer)

- Integration test: Render patient list with 3 patients, click patient A card, verify URL contains patient A ID, verify demographics component displays patient A name/DOB/NHS number. Navigate back, click patient B, assert patient B details displayed not patient A. Test should fail if wrong patient shown.
- Unit test: Render Demographics component with patient prop, change patient prop to different patient, re-render, assert component displays new patient not old patient. Verify React key forces new component instance.
- Integration test: Open two browser windows, load patient A in window 1, load patient B in window 2, rapidly switch between tabs, verify each tab maintains correct patient context without crossover.
- Unit test: Mock patient list with 100 patients, filter list by name, verify filtered patient cards have stable keys matching patient IDs, assert no key collisions detected by React warning logs.

### Training controls (deployment)

- Train clinicians to verify patient banner name and NHS number matches expected patient before prescribing medications or performing high-risk interventions. Include verification step in medication prescribing clinical workflow training.
- Document workflow: Before high-risk actions (prescribing chemotherapy, insulin, warfarin, sedatives), clinician must verbally confirm patient name and DOB aloud and check against wristband/photo ID.
- Include patient identification verification in clinical handover checklist: "I have verified patient identity by checking name, DOB, and NHS number on screen matches patient wristband."

### Business process controls (deployment)

- NHS Trust must have policy requiring two-person verification for high-risk interventions: prescribing chemotherapy, blood transfusions, surgery, conscious sedation. Second clinician independently verifies patient identity on screen and at bedside.
- Implement "read-back" policy: Clinician states patient name and DOB aloud before confirming medication administration in electronic system.
- Clinical governance policy: All clinical documentation must include patient identifier verification timestamp and method (e.g., "Identity verified via NHS number 123 456 7890 and wristband at 14:35").

**Harm:**
Wrong patient receives treatment/medication/procedure. Potential for serious injury or death if high-risk intervention (surgery, chemotherapy, insulin administration). Wrong patient discharged, medications reviewed for incorrect patient.

**Code associated with hazard:**

- `frontend/src/components/demographics/Demographics.tsx:49-78`
- `frontend/src/pages/Home.tsx:213-231`
- `frontend/src/components/ribbon/TopRibbon.tsx`
- `frontend/src/RootLayout.tsx`
