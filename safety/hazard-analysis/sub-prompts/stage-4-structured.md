# Stage 4 — structured hazard data

## Input

- Output from stage 3 - `/safety/outputs/stage-3-deduplicated.md`
- The root level codebase
- The hazard type taxonomy - `/safety/templates/hazard-types.md`
- The hazard markdown generator - `/safety/sub-prompts/hazard_log_generator.py`

## Output

- `/safety/outputs/stage-4-hazard-drafts/Hazard-NNNN.md` — one file per hazard.

## Your Task

You are given the deduplicated hazard list from Stage 3. Your job is to convert each hazard into a structured JSON object that can be fed into the Hazard Log Generator, `hazard_log_generator.py`, to produce formal hazard log entries.

## CRITICAL CONSTRAINTS

- You MUST NOT score hazards. Likelihood and Severity are always null.
- You MUST NOT implement any changes.
- General utility label is always [2] (New hazard for triage).
- Hazard status is always "open".
- Assignment is always "Clinical Safety Officer".
- You MUST output valid JSON only. No commentary outside the JSON block.

## Hazard Types Available

{{HAZARD_TYPES}}

## Output Format

Output a single JSON array. Each element is one hazard. Use this exact schema:

```json
[
  {
    "hazard_id": "Hazard-0001",
    "values": {
      "Hazard name": "Short descriptive name",
      "General utility label": [2],
      "Likelihood scoring": "TBC",
      "Severity scoring": "TBC",
      "Description": "A concise description of the hazard. 1-3 sentences.",
      "Cause(s)": "1. First upstream system cause\n2. Second cause",
      "Effect": "The change in the intended care pathway resulting from the cause.",
      "Hazard": "The potential for harm to occur, even if it does not.",
      "Hazard type": ["WrongPatient", "WrongPatientContext"],
      "Harm": "What actually happens to the patient or clinical context if the hazard is realised. Severity and likelihood TBC.",
      "Existing controls": "- First existing control\n- Second existing control",
      "Assignment": "Clinical Safety Officer",
      "Labelling": "TBC (awaiting scoring)",
      "Project": "Clinical Risk Management",
      "New hazard controls": "TBC — awaiting CSO triage and assessment.",
      "Residual hazard risk assessment": "TBC — awaiting initial controls.",
      "Hazard status": "Draft from LLM",
      "Code associated with hazard": [
        "src/path/to/file.tsx:42",
        "src/path/to/other.ts:15"
      ]
    }
  }
]
```

Feed each hazard's JSON contents into the `hazard_log_generator.py` function.
