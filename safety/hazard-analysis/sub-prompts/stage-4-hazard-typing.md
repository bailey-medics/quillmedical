# Stage 4 - hazard typing

## Input

- Output from stage 3 - `/safety/outputs/stage-3-deduplication.md`
- The root level codebase
- The hazard type taxonomy - `/safety/templates/hazard-types.md`

## Output

- `/safety/outputs/stage-4-hazard-typing.md`

## Your task

Go through each hazard in `/safety/outputs/stage-3-deduplication.md` and assign one or more `Hazard types`, as `/safety/templates/hazard-types.md`. `GeneralHazard` can be used if no other hazard type is appropriate.

## Output format

You will then add these hazard type(s) to a copy of the hazards from stage 3, and output into a new file `/safety/outputs/stage-4-hazard-typing.md`, with the hazard type(s) added, as the structure below:

```markdown
# Stage 4 - hazard typing

---

**Hazard id:** Hazard-0001

**Hazard name:** [A short name]

**Description:** [A general description of the Hazard]

**Causes:** [What system conditions or failures lead to this]

**Effect:** [What affect on the patient's care does this cause]

**Hazard:** [A verbose description of the potential for harm, even if it does not occur]

**Hazard types:** WrongPatient, WrongPatientContext <!-- New variable -->

**Harm:** [What actually happens to the patient if the hazard is realised]

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
