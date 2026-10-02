/**
 * Safety mock-up data.
 *
 * Import from `@lib/safety`. There is no API here and never will be:
 * the pages read fixtures directly. See
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

export {
  SAFETY_CASES,
  safetyCaseById,
  safetyDocumentById,
  openHazardCount,
  riskRating,
} from "./fixtures";
export { renderDocument, placeholderKeysIn } from "./render";
export type {
  DocumentStatus,
  Hazard,
  HazardStatus,
  Incident,
  IncidentSeverity,
  Officer,
  Placeholder,
  RiskScore,
  SafetyCase,
  SafetyCaseDetail,
  SafetyCaseStatus,
  SafetyDocument,
  SafetyStandard,
  SignOffItem,
} from "./types";
