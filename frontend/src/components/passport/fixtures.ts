/**
 * Shared fixtures for passport component stories and tests.
 *
 * Kept in one place so a story and its test describe the same sign-off,
 * and so a change to the API types surfaces here once rather than in a
 * dozen inline literals.
 *
 * The clinical content is invented. Nothing here is a real person, a real
 * patient or a real assessment.
 */

import type {
  CompetencyState,
  Registration,
  SignOff,
  Verification,
} from "@lib/passport";

export const declaredRegistration: Registration = {
  body: "GMC",
  number: "1234567",
  verified: false,
  verified_by: null,
  verified_on: null,
};

export const verifiedRegistration: Registration = {
  body: "GMC",
  number: "7654321",
  verified: true,
  verified_by: "dr.patel@example.nhs.uk",
  verified_on: "2026-04-02",
};

export const signedOffCompetency: CompetencyState = {
  id: "perform_bronchoscopy",
  name: "Perform bronchoscopy",
  status: "signed_off",
  level: { id: "unsupervised", name: "Can perform independently" },
  signed_on: "2026-03-14",
  signed_off_by: "Dr Amara Okonkwo",
  expires_on: "2027-03-14",
  sign_off: "2026-03-14-perform-bronchoscopy",
  previous_sign_offs: ["2025-09-02-perform-bronchoscopy"],
  logbook_entries: 38,
  certificates: ["2025-11-04-bronchoscopy-course"],
};

export const requestedCompetency: CompetencyState = {
  id: "perform_thoracic_ultrasound",
  name: "Perform thoracic ultrasound",
  status: "requested",
  level: null,
  signed_on: null,
  signed_off_by: null,
  expires_on: null,
  sign_off: "2026-03-21-perform-thoracic-ultrasound",
  previous_sign_offs: [],
  logbook_entries: 4,
  certificates: [],
};

export const declinedCompetency: CompetencyState = {
  id: "prescribe_sact",
  name: "Prescribe systemic anti-cancer therapy",
  status: "declined",
  level: null,
  signed_on: null,
  signed_off_by: null,
  expires_on: null,
  sign_off: "2026-02-01-prescribe-sact",
  previous_sign_offs: [],
  logbook_entries: 0,
  certificates: [],
};

export const competencies: CompetencyState[] = [
  signedOffCompetency,
  requestedCompetency,
  declinedCompetency,
];

export const signedOff: SignOff = {
  name: "2026-03-14-perform-bronchoscopy",
  id: "20260314T143207.000Z-3f2a8c1e",
  competency: { id: "perform_bronchoscopy", name: "Perform bronchoscopy" },
  kind: "progression",
  status: "signed_off",
  level: { id: "unsupervised", name: "Can perform independently" },
  observed_on: "2026-03-12",
  signed_at: "2026-03-14T14:32:07.000Z",
  expires_on: "2027-03-14",
  signed_off_by: {
    user_id: "42",
    name: "Dr Amara Okonkwo",
    role: "Consultant respiratory physician",
    registrations: [verifiedRegistration],
    registration_verified: true,
    care_location: "Bristol Royal Infirmary",
  },
  meaning: "directly observed",
  comments: "Straightforward diagnostic case. Ready to proceed unsupervised.",
  corrects: null,
  evidence: {
    logbook_entries: 38,
    logbook_digest: "sha256:9f2c…",
    certificates: ["2025-11-04-bronchoscopy-course"],
  },
  attachments: [
    {
      hash: "sha256:ab12cd34",
      filename: "dops-form.pdf",
      size_bytes: 104857,
      media_type: "application/pdf",
    },
  ],
  content_hash: "sha256:7f4e9a21bc0d",
};

export const requested: SignOff = {
  ...signedOff,
  name: "2026-03-21-perform-thoracic-ultrasound",
  id: "20260321T091044.000Z-8b1d5a7f",
  competency: {
    id: "perform_thoracic_ultrasound",
    name: "Perform thoracic ultrasound",
  },
  kind: "initial",
  status: "requested",
  level: null,
  observed_on: "2026-03-20",
  signed_at: null,
  expires_on: null,
  signed_off_by: null,
  meaning: null,
  comments: null,
  evidence: null,
  attachments: [],
  content_hash: null,
};

export const unchangedVerification: Verification = {
  name: "2026-03-14-perform-bronchoscopy",
  unchanged: true,
  content_hash: "sha256:7f4e9a21bc0d",
  recomputed_hash: "sha256:7f4e9a21bc0d",
  proves:
    "This record has not changed since it was written, and a named account signed it off.",
  does_not_prove:
    "It does not prove a professional registration, and it proves nothing to anyone who distrusts Quill itself.",
};

export const changedVerification: Verification = {
  ...unchangedVerification,
  unchanged: false,
  recomputed_hash: "sha256:0000deadbeef",
};
