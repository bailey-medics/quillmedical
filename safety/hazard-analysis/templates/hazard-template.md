<!-- [icon] -->

# Hazard name

A short name

## General utility label

[multiselect]
1 - Hazard: A hazard which is logged
2 - New hazard for triage: A new hazard which needs to be triaged for severity and likelihood, scored and assigned
3 - Deprecated hazard: A hazard which is no longer considered relevant

## Likelihood scoring

[select] [L]
TBC
1 - Very low: Negligible or nearly negligible possibility of occurring
2 - Low: Could occur but in the great majority of occasions will not
3 - Medium: Possible
4 - High: Not certain but very possible; reasonably expected to occur in the majority of cases
5 - Very high: Certain or almost certain; highly likely to occur

## Severity scoring

[select] [S]
TBC
1 - Minor: Minor injury, short term recovery; minor psychological upset; inconvenience; negligible consequence
2 - Significant: Minor injury, long term, 1; Significant psych. trauma, 1; Minor inj/psych trauma, 2+
3 - Considerable: Severe injury, 1, severe incapacity, recovery expected; Significant psych. trauma, 2+
4 - Major: Death, 1; Severe injury or life-changing incapacity, 1; Psychological trauma, 2+
5 - Catastrophic: Death, 2+. Severe injury or lifechanging incapacity, 2+

## Risk scoring

[calculate] [L] [S]
1 - Acceptable: Acceptable, no further action required [L1-S1, L1-S2, L2-S1]
2 - Acceptable: Acceptable if cost of further reduction > benefits, or further risk reduction is impractical [L1-S3, L1-S4, L2-S2, L2-S3, L3-S1, L3-S2, L4-S1]
3 - Undesirable: Undesirable level of risk. Attempts should be made to eliminate the hazard or implement controls [L1-S5, L2-S4, L3-S3, L3-S4, L4-S2, L4-S3, L5-S1]
4 - Mandatory-risk-elimination: Mandatory elimination of hazard or addition of controls to reduce risk to an acceptable level [L2-S5, L3-S5, L4-S4, L5-S2, L5-S3]
5 - Unacceptable: Unacceptable level of risk [L4-S5, L5-S4, L5-S5]

## Description

A general description of the Hazard. Keep it short. Detail goes below.

## Causes

The upstream system Cause (can be multiple - use a numbered list) that results in the change to intended care.

## Effect

The change in the intended care pathway resulting from the Cause.

## Hazard

A verbose description of the potential for harm, even if it does not occur

## Hazard type

[multiselect]
[hazard-types]

## Harm

An actual occurrence of a Hazard in the patient or clinical context. This is what we are assessing the Severity and Likelihood of. This is from normal working conditions and fault conditions. Include the ultimate Risk rating as well.

## Existing controls

List any pre-existing controls that can mitigate the hazard.

---

## Assignment

Assign this Hazard to its Owner. Default owner is the Clinical Safety Officer

## Labelling

Add labels according to Severity, Likelihood and Risk Level

## Project

TBC

---

## New hazard controls

List controls that will be put into place to mitigate the hazard. These can include design, (unit/integration) testing, training or business process change.

## Residual hazard risk assessment

Include a repeat analysis of Severity and Likelihood. Include the ultimate Risk rating as well.

## Hazard status

[select]
Draft from LLM
Open
Transferred
Closed

## Code associated with hazard

[code]
