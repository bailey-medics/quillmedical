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
  hazardById,
  incidentById,
  signOffSectionById,
  openHazardCount,
  riskRating,
} from "./fixtures";
export { renderDocument, placeholderKeysIn } from "./render";
export { likelihoodWord, severityWord, riskBand } from "./risk";
export {
  documentContentOf,
  officersOf,
  placeholdersOf,
  resetEdits,
  setDocumentContent,
  setOfficer,
  setPlaceholderValue,
  useDocumentContent,
  useOfficers,
  usePlaceholders,
} from "./edits";
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
