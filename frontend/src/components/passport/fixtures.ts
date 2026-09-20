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
  CpdEntry,
  Logbook,
  Registration,
  InboxItem,
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
  logbook_entries: 26,
  certificates: ["2026-01-15-thoracic-ultrasound-course"],
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
  logbook_entries: 12,
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

/**
 * One open request as the assessor's inbox returns it: the sign-off,
 * and the passport it belongs to. No other sign-off response carries
 * the passport id, because every other one takes it in the path.
 */
export const inboxItem: InboxItem = {
  passport_id: "3f2a8c1e",
  sign_off: requested,
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

/**
 * A competency's logbook. The entries are deliberately out of clinical
 * order — logged in one sitting, performed across three weeks — so a
 * test can tell whether the table sorts by `performed_on` rather than by
 * the order the server returned them.
 *
 * `count` is 38 while only three entries are listed: the API reports the
 * true total and a page may hold a subset, so the count must come from
 * the server rather than from `entries.length`.
 */
export const logbook: Logbook = {
  competency: "perform_bronchoscopy",
  count: 38,
  entries: [
    {
      filename: "2026-03-21-143207.yaml",
      competency: "perform_bronchoscopy",
      performed_on: "2026-03-18",
      setting: "Southmead Hospital",
      supervision: "independent",
      supervisor: null,
      indication: "Persistent cough, abnormal imaging",
      outcome: "Successful",
      notes: null,
      also_counts_towards: [],
      attachments: [],
    },
    {
      filename: "2026-03-21-143512.yaml",
      competency: "perform_bronchoscopy",
      performed_on: "2026-03-10",
      setting: "Bristol Royal Infirmary",
      supervision: "supervised",
      supervisor: "Dr Amara Okonkwo",
      indication: "Suspected endobronchial lesion",
      outcome: "Successful. Biopsies taken from right upper lobe.",
      notes: null,
      also_counts_towards: [],
      attachments: [],
    },
    {
      filename: "2026-03-21-144001.yaml",
      competency: "perform_bronchoscopy",
      performed_on: "2026-03-21",
      setting: null,
      supervision: null,
      supervisor: null,
      indication: null,
      outcome: "Abandoned — patient could not tolerate the procedure.",
      notes: "Rebooked with sedation.",
      also_counts_towards: [],
      attachments: [],
    },
  ],
};

export const singleEntryLogbook: Logbook = {
  competency: "perform_thoracic_ultrasound",
  count: 1,
  entries: [logbook.entries[1]],
};

export const emptyLogbook: Logbook = {
  competency: "prescribe_sact",
  count: 0,
  entries: [],
};

/**
 * A declared appraisal period: August to July, the ordinary case for
 * somebody whose appraisal falls in the summer.
 */
export const appraisalPeriod = { from: "2025-08-01", to: "2026-07-31" };

/**
 * A shortened period — moved post, appraisal brought forward. The reason
 * `appraisal_periods` is a history rather than one current month: the
 * same points across four months read very differently from twelve, and
 * only the stated range tells a reader which they are seeing.
 */
export const shortAppraisalPeriod = { from: "2026-08-01", to: "2026-11-30" };

/**
 * A period's CPD activities, deliberately out of clinical order so a
 * test can tell whether the table sorts by `activity_on`. One entry
 * claims no points, which still counts as an activity.
 */
export const cpdEntries: CpdEntry[] = [
  {
    filename: "2026-02-11-171930.yaml",
    year: 2026,
    activity_on: "2026-02-11",
    title: "Regional study day",
    activity_type: "teaching day",
    points: 6,
    competencies: [],
    certificate: null,
    notes: null,
    attachments: [],
  },
  {
    filename: "2025-09-04-090015.yaml",
    year: 2025,
    activity_on: "2025-09-04",
    title: "Thoracic oncology conference",
    activity_type: "conference",
    points: 3,
    competencies: [],
    certificate: null,
    notes: null,
    attachments: [],
  },
  {
    filename: "2026-01-20-084500.yaml",
    year: 2026,
    activity_on: "2026-01-20",
    title: "Departmental grand round",
    activity_type: "grand round",
    points: 2.5,
    competencies: [],
    certificate: null,
    notes: null,
    attachments: [],
  },
  {
    filename: "2026-03-02-130000.yaml",
    year: 2026,
    activity_on: "2026-03-02",
    title: "Journal club",
    activity_type: "other",
    points: null,
    competencies: [],
    certificate: null,
    notes: "No points claimed.",
    attachments: [],
  },
];
