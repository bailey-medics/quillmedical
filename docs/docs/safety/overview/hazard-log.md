# Hazard Log Guide

## Hazard Identification

Hazard identification must be carried out by a **multidisciplinary group** including:

- The Clinical Safety Officer
- Developers/engineers who understand the technical implementation
- Clinicians who will use the system (or who understand the clinical workflows)
- Implementation/deployment staff
- Patient representatives (where appropriate)

A single individual — even the CSO — is insufficient. Multiple perspectives are required to identify the full range of potential hazards.

### Methods

DCB 0129 Appendix B describes several formal hazard identification methods:

**SWIFT (Structured What-If Technique)** — the most commonly used for health IT. A brainstorming workshop where the clinical/system workflow is broken into individual tasks. Guidewords are tested against each task to generate ideas for hazards, causes, and controls.

Example guidewords:
- What if the system is unavailable?
- What if data is displayed incorrectly?
- What if the wrong patient record is accessed?
- What if a clinician enters data against the wrong patient?
- What if a critical alert is not shown?
- What if the system is slow to respond?
- What if data is lost during save?
- What if a third-party service is unavailable?

**HAZID (Hazard Identification)** — systematic identification of hazards associated with defined functions.

**FFA (Functional Failure Analysis)** — analysis of what happens when each function fails.

**Fishbone Diagrams** — cause-and-effect analysis for specific hazards.

For Quill Medical, **SWIFT workshops** are the recommended primary approach.

### Workshop Process

1. Define the scope — which features or workflows are being assessed
2. Distribute guidewords to participants in advance
3. Walk through each clinical/system workflow step by step
4. At each step, apply guidewords to identify potential hazards
5. For each hazard, identify causes, potential clinical impact, and existing controls
6. Record all findings in the Hazard Log
7. Assess and score each hazard after the workshop (or in a follow-up session)

---

## Hazard Log Structure

The Hazard Log should contain the following fields:

| Field | Description |
|-------|-------------|
| **Hazard ID** | Unique identifier (e.g. HAZ-001) |
| **Date Raised** | When the hazard was first identified |
| **Hazard Description** | Clear description of the hazard |
| **Potential Clinical Impact** | Effect in the care setting and potential impact on the patient |
| **Possible Cause(s)** | Technical failures, human error, configuration issues, etc. A hazard may have multiple causes |
| **Existing Controls** | Controls already in place that mitigate the hazard |
| **Initial Severity** | Severity rating before additional mitigations |
| **Initial Likelihood** | Likelihood rating before additional mitigations |
| **Initial Risk Rating** | Combined rating from the risk matrix |
| **Additional Mitigations** | Design features, configurations, or processes implemented to further reduce risk |
| **Residual Severity** | Severity after mitigations |
| **Residual Likelihood** | Likelihood after mitigations |
| **Residual Risk Rating** | Final mitigated risk rating |
| **Risk Acceptability** | Acceptable / Tolerable / Undesirable / Unacceptable |
| **Status** | Open / Closed / Transferred |
| **Owner** | Who is responsible for the hazard's management |
| **Notes / Evidence** | References to testing evidence, design decisions, etc. |

---

## The Risk Matrix

DCB 0129 uses a **5×5 risk estimation matrix** combining Severity and Likelihood.

### Severity Categories

| Level | Category | Description |
|-------|----------|-------------|
| 1 | **Negligible** | Minor injury or illness not requiring healthcare intervention. Minimal impact on care delivery. |
| 2 | **Minor** | Minor injury or illness requiring minor intervention. Short-term impact on care. |
| 3 | **Considerable** | Moderate injury or illness requiring professional intervention. Significant but recoverable impact. |
| 4 | **Major** | Major injury, long-term incapacity, or disability. Significant harm requiring major intervention. |
| 5 | **Catastrophic** | Death or permanent life-changing incapacity. |

### Likelihood Categories

| Level | Category | Description |
|-------|----------|-------------|
| 1 | **Very Low** | Negligible or near-impossible likelihood of occurrence |
| 2 | **Low** | Unlikely but possible |
| 3 | **Medium** | Possible — could occur during normal operation |
| 4 | **High** | Likely to occur |
| 5 | **Very High** | Almost certain to occur |

### Risk Estimation Matrix

|  | Negligible (1) | Minor (2) | Considerable (3) | Major (4) | Catastrophic (5) |
|---|---|---|---|---|---|
| **Very High (5)** | 2 - Tolerable | 3 - Undesirable | 4 - Unacceptable | 4 - Unacceptable | 4 - Unacceptable |
| **High (4)** | 1 - Acceptable | 2 - Tolerable | 3 - Undesirable | 4 - Unacceptable | 4 - Unacceptable |
| **Medium (3)** | 1 - Acceptable | 2 - Tolerable | 3 - Undesirable | 3 - Undesirable | 4 - Unacceptable |
| **Low (2)** | 1 - Acceptable | 1 - Acceptable | 2 - Tolerable | 2 - Tolerable | 3 - Undesirable |
| **Very Low (1)** | 1 - Acceptable | 1 - Acceptable | 1 - Acceptable | 2 - Tolerable | 3 - Undesirable |

### Risk Acceptability Levels

| Level | Category | Meaning | Action Required |
|-------|----------|---------|-----------------|
| 1 | **Acceptable** | Risk is broadly acceptable | No further action needed; maintain existing controls |
| 2 | **Tolerable** | Risk is tolerable if cost of further reduction outweighs benefit | Monitor and review; consider if further reduction is reasonably practicable |
| 3 | **Undesirable** | Risk is undesirable and should be reduced | Additional safeguards must be implemented; requires senior management attention |
| 4 | **Unacceptable** | Risk is unacceptable | Must not proceed. CSO must raise with Top Management. Requires immediate action or the system must not be released. |

The **ALARP (As Low As Reasonably Practicable)** principle applies throughout — risk should always be reduced where it is reasonably practicable to do so, even if the current rating is Tolerable.

---

## Hazard Status Lifecycle

| Status | Meaning |
|--------|---------|
| **Open** | Not all clinical risk management actions have been completed |
| **Closed** | All actions are complete; residual risk is at an acceptable or tolerable level |
| **Transferred** | All manufacturer-side actions are complete; residual controls are the responsibility of the deploying organisation (documented for their DCB 0160 assessment) |

---

## Maintaining the Hazard Log

The Hazard Log is a **living document**. It must be:

- Updated whenever new hazards are identified (from development, testing, incidents, or user feedback)
- Reviewed and updated for each new release or significant change
- Reviewed at least annually as part of a formal hazard workshop
- Versioned — each version must be approved by the CSO
- A baseline snapshot must accompany each CSCR

New controls introduced as mitigations must themselves be assessed for whether they could introduce new hazards or adversely impact the risk associated with existing hazards.

## Tooling

Hazard Logs can be maintained in spreadsheets, but dedicated tools exist:

- **SafetyLogix** (safetylogix.co.uk) — dedicated DCB 0129/0160 hazard log management tool with interactive risk matrix, collaboration features, and multiple export formats
- Custom spreadsheet using the NHS Digital templates as a starting point
- Integration into existing project management tools (with appropriate structure)
