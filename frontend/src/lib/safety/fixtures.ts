/**
 * Safety mock-up fixtures.
 *
 * Five fictional safety cases for the demonstration. **Everything here is
 * invented**: the systems, the people, the hazards and the incidents.
 * Incidents describe a system fault and never a patient, and every email
 * is at example.org. See
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * The hazard log follows the usual DCB0129 shape: a likelihood and a
 * severity, each 1 to 5, before and after mitigation.
 */

import type {
  Hazard,
  Officer,
  Placeholder,
  RiskScore,
  SafetyCaseDetail,
  SafetyDocument,
  SignOffItem,
} from "./types";
import {
  CLINICAL_RISK_MANAGEMENT_PLAN,
  CLINICAL_SAFETY_CASE_REPORT,
  FILE_INDEX,
  hazardLogMarkdown,
} from "./documentTemplates";

/**
 * The risk rating DCB0129 gives a likelihood and severity pair: their
 * product, 1 to 25.
 */
export function riskRating(likelihood: RiskScore, severity: RiskScore) {
  return likelihood * severity;
}

/** How many hazards on a case are still open. */
export function openHazardCount(safetyCase: SafetyCaseDetail): number {
  return safetyCase.hazards.filter((hazard) => hazard.status === "open").length;
}

const STANDARD_DOCUMENTS = (
  version: string,
  approved: boolean,
  hazards: Hazard[],
): SafetyDocument[] => [
  {
    id: "crmp",
    name: "Clinical risk management plan",
    version,
    status: approved ? "approved" : "draft",
    updated_on: "2026-08-14",
    content: CLINICAL_RISK_MANAGEMENT_PLAN,
  },
  {
    id: "hazard-log",
    name: "Hazard log",
    version,
    status: approved ? "approved" : "draft",
    updated_on: "2026-09-22",
    content: hazardLogMarkdown(hazards),
  },
  {
    id: "cscr",
    name: "Clinical safety case report",
    version,
    status: approved ? "approved" : "draft",
    updated_on: "2026-09-25",
    content: CLINICAL_SAFETY_CASE_REPORT,
  },
  {
    id: "file-index",
    name: "Clinical risk management file index",
    version,
    status: "approved",
    updated_on: "2026-07-03",
    content: FILE_INDEX,
  },
];

const STANDARD_SIGN_OFF = (
  cso: string,
  signed: boolean,
  partial = false,
): SignOffItem[] => [
  {
    section: "Clinical risk management plan",
    signatory: cso,
    signed_on: signed || partial ? "2026-08-14" : null,
  },
  {
    section: "Hazard log reviewed",
    signatory: cso,
    signed_on: signed || partial ? "2026-09-22" : null,
  },
  {
    section: "Clinical safety case report",
    signatory: cso,
    signed_on: signed ? "2026-09-25" : null,
  },
  {
    section: "Top management approval",
    signatory: "Dr Priya Nandakumar",
    signed_on: signed ? "2026-09-26" : null,
  },
];

const officers = (cso: string, deputy: string, owner: string): Officer[] => [
  {
    role: "Clinical safety officer",
    name: cso,
    email: `${cso.toLowerCase().replace(/^dr /, "").replace(/ /g, ".")}@example.org`,
  },
  {
    role: "Deputy clinical safety officer",
    name: deputy,
    email: `${deputy.toLowerCase().replace(/^dr /, "").replace(/ /g, ".")}@example.org`,
  },
  {
    role: "Product owner",
    name: owner,
    email: `${owner.toLowerCase().replace(/ /g, ".")}@example.org`,
  },
  {
    role: "Top management",
    name: "Dr Priya Nandakumar",
    email: "priya.nandakumar@example.org",
  },
];

const placeholders = (
  product: string,
  version: string,
  supplier: string,
): Placeholder[] => [
  {
    key: "product_name",
    value: product,
    used_in: [
      "Clinical risk management plan",
      "Hazard log",
      "Clinical safety case report",
    ],
  },
  {
    key: "product_version",
    value: version,
    used_in: ["Clinical safety case report"],
  },
  {
    key: "supplier_name",
    value: supplier,
    used_in: ["Clinical risk management plan", "Clinical safety case report"],
  },
  {
    key: "deploying_organisation",
    value: "Wessex Valley NHS Foundation Trust",
    used_in: ["Clinical risk management plan"],
  },
  {
    key: "review_interval",
    value: "12 months",
    used_in: ["Clinical risk management plan"],
  },
];

const ePrescribingHazards: Hazard[] = [
  {
    id: "H-01",
    description: "Wrong dose unit shown on the prescribing screen",
    cause: "Unit defaults to mg where the formulary entry is in micrograms",
    effect: "Prescriber confirms a dose a thousand times too large",
    mitigation:
      "Dose unit is taken from the formulary entry and cannot be changed by the prescriber; a dose outside the entry's range needs a second confirmation naming the unit.",
    initial_likelihood: 3,
    initial_severity: 5,
    residual_likelihood: 1,
    residual_severity: 5,
    status: "mitigated",
  },
  {
    id: "H-02",
    description: "Allergy alert suppressed after a session timeout",
    cause: "Alert state is held in the browser and lost on re-login",
    effect: "A drug the patient is allergic to is prescribed unchallenged",
    mitigation:
      "Allergy state moved from the browser to the server and re-fetched on every prescribing screen; a session that cannot fetch it blocks prescribing rather than proceeding.",
    initial_likelihood: 2,
    initial_severity: 5,
    residual_likelihood: 1,
    residual_severity: 4,
    status: "open",
  },
  {
    id: "H-03",
    description: "Duplicate order created on a double submit",
    cause: "Submit button stays enabled while the request is in flight",
    effect: "Two doses are administered",
    mitigation:
      "Submit button disabled while the request is in flight, and the server rejects a second order identical to one in the last 60 seconds.",
    initial_likelihood: 4,
    initial_severity: 3,
    residual_likelihood: 1,
    residual_severity: 3,
    status: "closed",
  },
  {
    id: "H-04",
    description: "Weight-based dose calculated from a stale weight",
    cause: "No prompt when the recorded weight is older than 30 days",
    effect: "Under or over dosing in children",
    mitigation:
      "Weight-based calculations show the weight's date beside the dose and refuse to calculate from a weight older than 30 days for a patient under 16 until it is re-entered.",
    initial_likelihood: 3,
    initial_severity: 4,
    residual_likelihood: 2,
    residual_severity: 4,
    status: "open",
  },
];

const portalHazards: Hazard[] = [
  {
    id: "H-01",
    description: "Result released to the portal before clinician review",
    cause: "Release rule keyed on report status, not on acknowledgement",
    effect: "A patient reads a serious result with nobody to explain it",
    mitigation:
      "Release now keyed on the requesting clinician's acknowledgement, with a 72-hour hold on any report flagged abnormal.",
    initial_likelihood: 3,
    initial_severity: 4,
    residual_likelihood: 1,
    residual_severity: 4,
    status: "mitigated",
  },
  {
    id: "H-02",
    description: "Appointment letter shown for the wrong patient",
    cause: "Proxy access cache keyed on the device rather than the account",
    effect: "Confidential information disclosed to a family member",
    mitigation:
      "Proxy access cache keyed on the account and cleared on every sign-out; a device-level cache is no longer kept.",
    initial_likelihood: 2,
    initial_severity: 4,
    residual_likelihood: 1,
    residual_severity: 4,
    status: "closed",
  },
  {
    id: "H-03",
    description: "Message to the clinic silently fails to send",
    cause: "No retry or failure notice when the gateway times out",
    effect:
      "A patient believes they have reported a symptom and nobody sees it",
    mitigation:
      "Gateway failures are retried three times, then shown to the patient with a phone number to call; unsent messages stay in an outbox the patient can see.",
    initial_likelihood: 3,
    initial_severity: 3,
    residual_likelihood: 2,
    residual_severity: 3,
    status: "open",
  },
];

const resultsHazards: Hazard[] = [
  {
    id: "H-01",
    description: "Abnormal result filed without acknowledgement",
    cause: "Auto-file rule matches on test code alone",
    effect: "A critical result is never actioned",
    mitigation:
      "Auto-file rules may not match a result flagged abnormal; every such result needs a named clinician's acknowledgement.",
    initial_likelihood: 3,
    initial_severity: 5,
    residual_likelihood: 1,
    residual_severity: 5,
    status: "mitigated",
  },
  {
    id: "H-02",
    description: "Acknowledgement recorded against the wrong clinician",
    cause: "Shared workstation session not ended between users",
    effect: "Responsibility for follow-up is unclear",
    mitigation:
      "Shared workstations end the session after two minutes idle, and acknowledgement asks for the clinician's PIN.",
    initial_likelihood: 3,
    initial_severity: 3,
    residual_likelihood: 2,
    residual_severity: 3,
    status: "open",
  },
  {
    id: "H-03",
    description: "Result worklist stops refreshing",
    cause: "Websocket reconnect gives up after five attempts",
    effect: "New results do not appear until the page is reloaded",
    mitigation:
      "Reconnect retries indefinitely with backoff and the worklist shows a visible banner while it is stale.",
    initial_likelihood: 4,
    initial_severity: 3,
    residual_likelihood: 1,
    residual_severity: 3,
    status: "closed",
  },
  {
    id: "H-04",
    description: "Result from an outside laboratory shown without units",
    cause: "Inbound HL7 message omits OBX-6 and the display shows a blank",
    effect: "A value is misread against the wrong reference range",
    mitigation:
      "A result with no unit is held in a review queue and never shown on the worklist until a laboratory confirms the unit.",
    initial_likelihood: 2,
    initial_severity: 4,
    residual_likelihood: 1,
    residual_severity: 4,
    status: "mitigated",
  },
  {
    id: "H-05",
    description: "Delta flag missing on a rapidly changing value",
    cause: "Comparison uses the last filed result, not the last reported one",
    effect: "A deteriorating trend is not noticed",
    mitigation:
      "Delta comparison now uses the last reported result, and a delta flag is shown on the worklist as well as the detail.",
    initial_likelihood: 2,
    initial_severity: 4,
    residual_likelihood: 2,
    residual_severity: 4,
    status: "open",
  },
];

const bedBoardHazards: Hazard[] = [
  {
    id: "H-01",
    description: "Patient shown in a bed they have left",
    cause: "Discharge message from the PAS is delayed by up to 20 minutes",
    effect:
      "A bed is held empty while a patient waits in the emergency department",
    mitigation:
      "Board polls the PAS every two minutes and shows the time of the last update; a bed with a pending discharge is marked as such.",
    initial_likelihood: 4,
    initial_severity: 2,
    residual_likelihood: 2,
    residual_severity: 2,
    status: "mitigated",
  },
  {
    id: "H-02",
    description: "Isolation flag not carried on a ward transfer",
    cause: "Flag stored on the bed record rather than the patient record",
    effect: "An infectious patient is placed in a shared bay",
    mitigation:
      "Isolation flag moved to the patient record so it travels with a transfer, and a bay placement warns when any occupant is flagged.",
    initial_likelihood: 2,
    initial_severity: 4,
    residual_likelihood: 1,
    residual_severity: 4,
    status: "open",
  },
];

const dischargeHazards: Hazard[] = [
  {
    id: "H-01",
    description: "Medication list on the letter omits a changed dose",
    cause: "Letter reads the admission list, not the discharge reconciliation",
    effect: "A GP continues the pre-admission dose",
    mitigation:
      "Letter reads the discharge reconciliation and will not generate until the pharmacist has completed it.",
    initial_likelihood: 3,
    initial_severity: 4,
    residual_likelihood: 1,
    residual_severity: 4,
    status: "mitigated",
  },
  {
    id: "H-02",
    description: "Letter sent to a previous GP practice",
    cause: "Registered practice read from a cached demographic record",
    effect: "The current GP never receives the discharge summary",
    mitigation:
      "Registered practice is fetched live from the demographics service at the moment of sending, never from a cache.",
    initial_likelihood: 2,
    initial_severity: 3,
    residual_likelihood: 1,
    residual_severity: 3,
    status: "closed",
  },
  {
    id: "H-03",
    description: "Follow-up actions lost when the letter is regenerated",
    cause: "Free-text section is not preserved on template change",
    effect: "A requested repeat blood test is never arranged",
    mitigation:
      "Free-text sections are preserved across template changes and the letter asks for confirmation before any section is dropped.",
    initial_likelihood: 3,
    initial_severity: 3,
    residual_likelihood: 1,
    residual_severity: 3,
    status: "mitigated",
  },
];

/** The five demonstration cases, in the order the landing table shows them. */
export const SAFETY_CASES: readonly SafetyCaseDetail[] = [
  {
    id: "sc-001",
    title: "Electronic prescribing module",
    system: "MedScribe EPMA 4.2",
    standard: "DCB0129",
    status: "in_review",
    clinical_safety_officer: "Dr Hannah Okafor",
    updated_on: "2026-09-25",
    documents: STANDARD_DOCUMENTS("4.2", false, ePrescribingHazards),
    hazards: ePrescribingHazards,
    incidents: [
      {
        id: "INC-2026-004",
        occurred_on: "2026-06-11",
        summary:
          "Two identical orders created when a slow network let the submit button be pressed twice",
        severity: "moderate",
        hazard_id: "H-03",
      },
      {
        id: "INC-2026-009",
        occurred_on: "2026-08-02",
        summary:
          "Allergy banner absent after a user was signed out mid-session and signed back in",
        severity: "high",
        hazard_id: "H-02",
      },
    ],
    officers: officers("Dr Hannah Okafor", "Dr Tom Reilly", "Sarah Lindqvist"),
    sign_off: STANDARD_SIGN_OFF("Dr Hannah Okafor", false, true),
    placeholders: placeholders("MedScribe EPMA", "4.2", "MedScribe Health Ltd"),
  },
  {
    id: "sc-002",
    title: "Patient portal",
    system: "MyCare portal 2.0",
    standard: "DCB0160",
    status: "signed_off",
    clinical_safety_officer: "Dr Tom Reilly",
    updated_on: "2026-09-26",
    documents: STANDARD_DOCUMENTS("2.0", true, portalHazards),
    hazards: portalHazards,
    incidents: [
      {
        id: "INC-2026-002",
        occurred_on: "2026-04-19",
        summary:
          "A histology report appeared in the portal twelve hours before the requesting clinician opened it",
        severity: "high",
        hazard_id: "H-01",
      },
    ],
    officers: officers("Dr Tom Reilly", "Dr Hannah Okafor", "James Whitfield"),
    sign_off: STANDARD_SIGN_OFF("Dr Tom Reilly", true),
    placeholders: placeholders("MyCare portal", "2.0", "Northgate Digital"),
  },
  {
    id: "sc-003",
    title: "Results acknowledgement service",
    system: "ResultsHub 1.8",
    standard: "DCB0129",
    status: "in_review",
    clinical_safety_officer: "Dr Amara Diallo",
    updated_on: "2026-09-22",
    documents: STANDARD_DOCUMENTS("1.8", false, resultsHazards),
    hazards: resultsHazards,
    incidents: [
      {
        id: "INC-2026-006",
        occurred_on: "2026-07-08",
        summary:
          "Worklist on a ward workstation had not refreshed for three hours; new results were visible only after reload",
        severity: "moderate",
        hazard_id: "H-03",
      },
      {
        id: "INC-2026-011",
        occurred_on: "2026-08-30",
        summary:
          "A potassium result from a community laboratory displayed with no unit",
        severity: "moderate",
        hazard_id: "H-04",
      },
      {
        id: "INC-2026-012",
        occurred_on: "2026-09-03",
        summary:
          "Acknowledgement recorded against the previous user of a shared workstation",
        severity: "low",
        hazard_id: "H-02",
      },
    ],
    officers: officers("Dr Amara Diallo", "Dr Tom Reilly", "Sarah Lindqvist"),
    sign_off: STANDARD_SIGN_OFF("Dr Amara Diallo", false, true),
    placeholders: placeholders("ResultsHub", "1.8", "Pathway Informatics"),
  },
  {
    id: "sc-004",
    title: "Bed management board",
    system: "WardView 3.1",
    standard: "DCB0160",
    status: "draft",
    clinical_safety_officer: "Dr Hannah Okafor",
    updated_on: "2026-09-12",
    documents: STANDARD_DOCUMENTS("3.1", false, bedBoardHazards),
    hazards: bedBoardHazards,
    incidents: [],
    officers: officers(
      "Dr Hannah Okafor",
      "Dr Amara Diallo",
      "James Whitfield",
    ),
    sign_off: STANDARD_SIGN_OFF("Dr Hannah Okafor", false),
    placeholders: placeholders("WardView", "3.1", "Northgate Digital"),
  },
  {
    id: "sc-005",
    title: "Discharge letter generator",
    system: "LetterFlow 5.0",
    standard: "DCB0129",
    status: "signed_off",
    clinical_safety_officer: "Dr Amara Diallo",
    updated_on: "2026-08-29",
    documents: STANDARD_DOCUMENTS("5.0", true, dischargeHazards),
    hazards: dischargeHazards,
    incidents: [
      {
        id: "INC-2026-001",
        occurred_on: "2026-03-14",
        summary:
          "Discharge summary sent to a practice the patient had left two years earlier",
        severity: "moderate",
        hazard_id: "H-02",
      },
    ],
    officers: officers(
      "Dr Amara Diallo",
      "Dr Hannah Okafor",
      "Sarah Lindqvist",
    ),
    sign_off: STANDARD_SIGN_OFF("Dr Amara Diallo", true),
    placeholders: placeholders("LetterFlow", "5.0", "MedScribe Health Ltd"),
  },
];

/** The hazard with this reference on a case, or undefined. */
export function hazardById(
  safetyCase: SafetyCaseDetail,
  hazardId: string,
): Hazard | undefined {
  return safetyCase.hazards.find((hazard) => hazard.id === hazardId);
}

/** The document with this id on a case, or undefined. */
export function safetyDocumentById(
  safetyCase: SafetyCaseDetail,
  documentId: string,
): SafetyDocument | undefined {
  return safetyCase.documents.find((document) => document.id === documentId);
}

/** The case with this id, or undefined for an address nobody has. */
export function safetyCaseById(id: string): SafetyCaseDetail | undefined {
  return SAFETY_CASES.find((safetyCase) => safetyCase.id === id);
}
