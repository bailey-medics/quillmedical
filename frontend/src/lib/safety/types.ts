/**
 * Safety mock-up types.
 *
 * The shapes the safety pages render. **This is a throwaway mock-up with
 * no backend**: nothing will be built on these shapes, and nothing
 * elsewhere in Quill may depend on them. See
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Strict unions rather than bare strings, so a typo in the fixtures is a
 * compile error rather than a blank badge.
 */

/** The clinical safety standard a case is written against. */
export type SafetyStandard = "DCB0129" | "DCB0160";

/** Where a safety case stands. */
export type SafetyCaseStatus = "draft" | "in_review" | "signed_off";

/** A likelihood or severity score on the DCB0129 5 by 5 matrix. */
export type RiskScore = 1 | 2 | 3 | 4 | 5;

/** Where a hazard stands in the hazard log. */
export type HazardStatus = "open" | "mitigated" | "closed";

/** How serious an incident was judged to be. */
export type IncidentSeverity = "low" | "moderate" | "high";

/** Where a safety case document stands. */
export type DocumentStatus = "draft" | "approved";

/** One document in the safety case file. */
export interface SafetyDocument {
  /** Document reference used in the address, such as "crmp" */
  id: string;
  /** Document name, as DCB0129 names it */
  name: string;
  /**
   * The document as markdown, with `{{ key }}` placeholders that the
   * case's placeholder table fills in. See `renderDocument`.
   */
  content: string;
  /** Version string, such as "1.2" */
  version: string;
  status: DocumentStatus;
  /** ISO date of the last change */
  updated_on: string;
}

/** One line of the hazard log. */
export interface Hazard {
  /** Hazard reference, such as "H-01" */
  id: string;
  description: string;
  cause: string;
  effect: string;
  initial_likelihood: RiskScore;
  initial_severity: RiskScore;
  residual_likelihood: RiskScore;
  residual_severity: RiskScore;
  status: HazardStatus;
}

/** One safety incident, linked to the hazard it realised. */
export interface Incident {
  /** Incident reference, such as "INC-2026-004" */
  id: string;
  /** ISO date the incident occurred */
  occurred_on: string;
  summary: string;
  severity: IncidentSeverity;
  /** The hazard this incident is an instance of */
  hazard_id: string;
}

/** A named person with a role on the case. */
export interface Officer {
  role: string;
  name: string;
  /** A contact address at example.org */
  email: string;
}

/** One line of the compliance sign-off checklist. */
export interface SignOffItem {
  /** The section of the standard, such as "Clinical risk management plan" */
  section: string;
  signatory: string;
  /** ISO date signed, or null while awaiting */
  signed_on: string | null;
}

/** A value substituted into every document of the case. */
export interface Placeholder {
  /** The key as it appears in a template, such as "product_name" */
  key: string;
  value: string;
  /** Which documents use it */
  used_in: string[];
}

/** One safety case, as the landing table lists it. */
export interface SafetyCase {
  /** Case reference, such as "sc-001", used in the address */
  id: string;
  title: string;
  /** The system the case is about */
  system: string;
  standard: SafetyStandard;
  status: SafetyCaseStatus;
  clinical_safety_officer: string;
  /** ISO date of the last change */
  updated_on: string;
}

/** A safety case with everything its six pages show. */
export interface SafetyCaseDetail extends SafetyCase {
  documents: SafetyDocument[];
  hazards: Hazard[];
  incidents: Incident[];
  officers: Officer[];
  sign_off: SignOffItem[];
  placeholders: Placeholder[];
}
