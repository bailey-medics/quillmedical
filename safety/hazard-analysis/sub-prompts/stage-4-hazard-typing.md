# Stage 4 - hazard typing

## Input

- Output files from stage 3 - `/safety/hazard-analysis/outputs/stage-3-deduplication/hazard-NNNN.md`
- The root level codebase
- The hazard type taxonomy - `/safety/hazard-analysis/templates/hazard-types.md`

## Output

- `/safety/hazard-analysis/outputs/stage-4-hazard-typing/hazard-NNNN.md` - one file per hazard

## Your task

Go through each hazard file in `/safety/hazard-analysis/outputs/stage-3-deduplication/hazard-NNN.md` and assign one or more `Hazard types`, as `/safety/hazard-analysis/templates/hazard-types.md`. `GeneralHazard` can be used if no other hazard type is appropriate.

## Output format

You will then add these hazard type(s) to a copy of the hazard file from stage 3, and output into a new file `/safety/hazard-analysis/outputs/stage-4-hazard-typing/hazard-NNNN.md`, with an identical `NNNN` number, with the hazard type(s) added, as the structure below:

```markdown
# Hazard

**Hazard id:** Hazard-[NNNN]

**Hazard name:** [A short name]

**Description:** [A general description of the Hazard]

**Causes:** [What system conditions or failures lead to this]

**Effect:** [What affect on the patient's care does this cause]

**Hazard:** [A verbose description of the potential for harm, even if it does not occur]

**Hazard types:** [A hazard type, as `/safety/hazard-analysis/templates/hazard-types.md`, in bullet point list form] <!-- New variable -->

**Harm:** [What actually happens to the patient if the hazard is realised]

**Code associated with hazard:**

- `path/to/file.tsx:LINE`
- `path/to/other.ts:LINE`
- `path/to/other2.tsx:LINE`
- `path/to/other3.ts:LINE`
```
