# Stage 3 - deduplication

## Input

- Output from stage 2 - `/safety/outputs/stage-2-discovery.md`
- The root level codebase

## Output

- `/safety/outputs/stage-3-deduplicated.md`

## Your task

You are given the raw hazard discovery output from Stage 2. This was produced by analysing the codebase file-by-file, so the same underlying hazard may appear multiple times. Your job is to consolidate the findings from stage 2 into a clean, deduplicated list of distinct hazards.

## CRITICAL CONSTRAINTS

- You MUST NOT score hazards. Do not assign severity or likelihood.
- You MUST NOT implement any changes or fixes.
- When merging, preserve ALL code locations from the original entries.
- When in doubt whether two hazards are the same, keep them separate.

## Process

- If the same hazard (same cause, same harm) appears from multiple files, merge into one entry. Combine all file references.

## Output format

Number each hazard sequentially (as the `Output destination` variable).

Use this exact structure:

```markdown
# Stage 3 - deduplicated hazard List

---

**Hazard id:** Hazard-0001

**Hazard name:** [A short name]

**Description:** [A general description of the Hazard]

**Causes:** [What system conditions or failures lead to this]

**Effect:** [What affect on the patient's care does this cause]

**Hazard:** [A verbose description of the potential for harm, even if it does not occur]

**Harm:** [What actually happens to the patient if the hazard is realised]

**Code associated with hazard:**

- `path/to/file.tsx:LINE`
- `path/to/other1.ts:LINE`
- `path/to/other2.tsx:LINE`
- `path/to/other3.ts:LINE`

---

**Hazard id:** Hazard-0002

**Hazard name:** [A short name]

...
```
