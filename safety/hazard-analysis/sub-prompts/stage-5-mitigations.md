# Stage 5 — mitigation suggestions

## Inputs

- Output from stage 4 - `/safety/outputs/stage-4-hazard-typing.md`
- The codebase

## Output

- `/safety/outputs/stage-5-mitigations.md`

## Your task

You are given the hazard list from Stage 4 and relevant source code. For each hazard, suggest potential controls that could reduce risk.

## CRITICAL CONSTRAINTS

- These are SUGGESTIONS ONLY. The Clinical Safety Officer decides what to implement.
- You MUST NOT implement any changes, write any code, or modify any files.
- You MAY describe code patterns or approaches in prose, but do not write
  the actual implementation.
- Distinguish clearly between manufacturer-side and deployment-side controls.

## Control categories

For each hazard, suggest controls in these categories where applicable:

**Design controls** (manufacturer-side): Changes to code architecture, UI
design, data flow, or system behaviour that prevent or reduce the hazard.
Describe the approach, not the implementation.

**Testing controls** (manufacturer-side): Specific test cases or testing
approaches that would detect if the hazard's controls fail. Include what the test should verify and what constitutes a pass/fail.

**Training controls** (deployment-side): User training, clinical workflow
guidance, or documentation that the deploying NHS organisation would need to provide. These are flagged for inclusion in the DCB 0160 deployment template.

**Business process controls** (deployment-side): Operational procedures,
policies, or workflows that the deploying organisation would need to implement. E.g. "Organisation must have a policy for verifying patient identity before accessing the EPR."

## Rules

1. At least one control per hazard. Most hazards should have 2–5 controls
   across categories.
2. Design controls are preferred over training/process controls (engineer out the risk rather than train around it).
3. Be specific. "Improve error handling" is not useful. "Catch FHIR API 4xx responses in the patient demographics fetch and display a clear banner indicating data may be incomplete" is more useful.
4. For testing controls, describe the scenario concretely enough that a
   developer could write the test from your description.
5. Flag any controls that would require significant architectural changes — the Clinical Safety Officer needs to weigh effort against risk reduction.

## Output format

You will then add these mitigations to a copy of the hazards from stage 4, and output into a new file `/safety/outputs/stage-5-mitigations.md`, with the mitigations added, as the structure below:

```markdown
# Stage 5 - mitigation suggestions

---

**Hazard id:** Hazard-0001

**Hazard name:** [A short name]

**Description:** [A general description of the Hazard]

**Causes:** [What system conditions or failures lead to this]

**Effect:** [What affect on the patient's care does this cause]

**Hazard:** [A verbose description of the potential for harm, even if it does not occur]

**Hazard types:** WrongPatient, WrongPatientContext

**Harm:** [What actually happens to the patient if the hazard is realised]

**Hazard controls:** [List of controls that could be put into place to mitigate the hazard. These can include design, (unit/integration) testing, training or business process change.] <!-- New variable-->

**Code associated with hazard:**

- `path/to/file.tsx:LINE`
- `path/to/other.ts:LINE`
- `path/to/other2.tsx:LINE`
- `path/to/other3.ts:LINE`

---

**Hazard id:** Hazard-0002

**Hazard name:** [A short name]

...
```
