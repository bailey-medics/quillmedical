/**
 * Safety document templates.
 *
 * None opens with a top-level heading: the sheet draws the document's
 * name, and a page has one h1, which is the page title.
 *
 * The four documents a DCB0129 case file carries, as markdown with
 * `{{ key }}` placeholders that the case's placeholder table fills in.
 * Fictional throughout. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import type { Hazard } from "./types";
import {
  LIKELIHOOD_WORDS as LIKELIHOOD,
  SEVERITY_WORDS as SEVERITY,
} from "./risk";

export const CLINICAL_RISK_MANAGEMENT_PLAN = `## 1. Purpose

This plan sets out how clinical risk is managed for {{ product_name }} version {{ product_version }}, supplied by {{ supplier_name }} and deployed at {{ deploying_organisation }}. It follows DCB0129, Clinical Risk Management: its Application in the Manufacture of Health IT Systems.

## 2. Scope

The plan covers the design, build, test, release and maintenance of {{ product_name }}, and every change to it until the product is withdrawn. It does not cover the deploying organisation's own processes, which are the subject of a separate DCB0160 assessment.

## 3. Clinical safety organisation

- A named clinical safety officer, a registered clinician with current training in clinical risk management, is accountable for this plan.
- A deputy stands in during leave.
- The product owner is responsible for ensuring hazards raised in development reach the hazard log.
- Top management approves the clinical safety case report before each release.

## 4. Hazard identification

Hazards are identified through structured review of each user story, through incident reports from live use, and through a hazard workshop before every major release. Every hazard is recorded in the hazard log with a cause, an effect and a risk rating.

## 5. Risk assessment

Each hazard is scored for likelihood (1, very low, to 5, very high) and severity (1, minor, to 5, catastrophic). The risk rating is their product. A rating of 10 or more is unacceptable without mitigation; 6 to 9 is undesirable and needs a documented decision; 3 to 4 is tolerable with review; 1 to 2 is acceptable.

## 6. Risk control

Controls are preferred in this order: design the hazard out, add a safeguard in the product, warn the user, and lastly rely on training or procedure. Every control is recorded against its hazard and tested before release.

## 7. Review

This plan and the hazard log are reviewed every {{ review_interval }}, and after any incident rated moderate or high.
`;

export const CLINICAL_SAFETY_CASE_REPORT = `## 1. Summary

This report presents the clinical safety case for {{ product_name }} version {{ product_version }}, manufactured by {{ supplier_name }}. It records the hazards identified, the controls in place, and the clinical safety officer's judgement on whether the residual risk is acceptable for use at {{ deploying_organisation }}.

## 2. System description

{{ product_name }} is a clinical information system in use across inpatient and outpatient settings. Version {{ product_version }} is the release this report covers; earlier versions are covered by their own reports in the clinical risk management file.

## 3. Clinical risk management activities

- Hazard workshop held with clinical and technical staff before the release.
- Hazard log reviewed line by line and every residual rating re-confirmed.
- Incident reports from live use since the last release reviewed and linked to hazards.
- Release tested against the controls recorded in the hazard log.

## 4. Hazard summary

The hazard log accompanying this report lists each hazard with its initial and residual risk. No hazard remains at an unacceptable residual rating. Hazards still open carry a documented plan and an owner.

## 5. Residual risk statement

In the judgement of the clinical safety officer, the residual clinical risk of {{ product_name }} version {{ product_version }} is as low as reasonably practicable and is acceptable for deployment, subject to the controls and the review interval of {{ review_interval }} set out in the clinical risk management plan.

## 6. Approval

Approved by the clinical safety officer and by top management, whose signatures are recorded in the compliance sign-off.
`;

export const FILE_INDEX = `The clinical risk management file for {{ product_name }} holds every document that supports the safety case. This index lists what is in it and where each document stands.

## Documents

1. Clinical risk management plan, version {{ product_version }}
2. Hazard log, version {{ product_version }}
3. Clinical safety case report, version {{ product_version }}
4. Incident reports, one per incident, cross-referenced to the hazard log
5. Release test evidence for each control
6. Training records for the clinical safety officer and deputy

## Custody

The file is held by {{ supplier_name }} and a copy is provided to {{ deploying_organisation }} with every release. It is retained for the life of the product and for ten years after withdrawal.
`;

/** The hazard log as a document, built from the case's hazards. */
export function hazardLogMarkdown(hazards: Hazard[]): string {
  const entries = hazards
    .map(
      (hazard) => `## ${hazard.id}: ${hazard.description}

- **Cause**: ${hazard.cause}
- **Effect**: ${hazard.effect}
- **Mitigation**: ${hazard.mitigation}
- **Initial risk**: likelihood ${hazard.initial_likelihood} (${LIKELIHOOD[hazard.initial_likelihood]}), severity ${hazard.initial_severity} (${SEVERITY[hazard.initial_severity]}), rating ${hazard.initial_likelihood * hazard.initial_severity}
- **Residual risk**: likelihood ${hazard.residual_likelihood} (${LIKELIHOOD[hazard.residual_likelihood]}), severity ${hazard.residual_severity} (${SEVERITY[hazard.residual_severity]}), rating ${hazard.residual_likelihood * hazard.residual_severity}
- **Status**: ${hazard.status}
`,
    )
    .join("\n");

  return `Hazard log for {{ product_name }} version {{ product_version }}. Each hazard is scored on the 5 by 5 matrix described in the clinical risk management plan, before and after the controls recorded against it.

${entries}`;
}
