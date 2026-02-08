# Stage 2 - discovery

## Inputs

- Output from stage 1 - `/safety/hazard-analysis/outputs/stage-1-inventory.md`
- The root level codebase

## Output

- `/safety/hazard-analysis/outputs/stage-2-discovery.md`

## Your task

**Process**: For each Tier 1–3 file found in `/safety/hazard-analysis/outputs/stage-1-inventory.md`. Your job is to identify every potential clinical safety hazard.

## CRITICAL CONSTRAINTS

- You MUST NOT score hazards. Do not assign severity or likelihood.
- You MUST NOT suggest fixes or implement anything at this stage.
- You MUST err on the side of over-identification. A false positive costs a few minutes of CSO review time. A false negative could cost a patient's life.

## Hazard identification method

For each file, apply SWIFT-style "what-if" reasoning from these perspectives, eg:

**Clinician perspective:**

- What if this shows data for the wrong patient?
- What if data entered here is saved against the wrong record?
- What if clinically significant data is hidden, truncated, or missing?
- What if the display order causes misinterpretation?
- What if an allergy or alert is not visible when it should be?

**System failure perspective:**

- What if this API call fails silently?
- What if the network drops mid-operation?
- What if cached/offline data is stale?
- What if this component renders before data has loaded?
- What if the service worker serves an outdated response?

**Security perspective:**

- What if a user without appropriate permissions reaches this code?
- What if session state persists after the user has walked away?
- What if patient data leaks into logs, URLs, or error messages?

**Concurrency perspective:**

- What if two users edit the same record simultaneously?
- What if the user switches patient context mid-operation?
- What if a background sync overwrites a foreground edit?

**Integration perspective:**

- What if a FHIR message is malformed or rejected?
- What if OpenEHR composition validation fails silently?
- What if a third-party service returns unexpected data?

## Output format

For each hazard found, output this exact structure:

```markdown
# Stage 2 - discovery

---

## [SHORT_NAME]

**Description:** [A general description of the Hazard]

**Causes:** [What system conditions or failures lead to this]

**Effect:** [What affect on the patient's care does this cause]

**Hazard:** [A verbose description of the potential for harm, even if it does not occur]

**Harm:** [What actually happens to the patient if the hazard is realised]

**Code associated with hazard:**

- `path/to/file.tsx:LINE`
- `path/to/other.ts:LINE`

---
```

Produce one block per hazard. If a single file has multiple distinct hazards,
produce multiple blocks. If the same hazard appears across multiple files,
list all files in one block.
