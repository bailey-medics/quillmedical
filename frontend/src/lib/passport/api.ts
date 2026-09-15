/**
 * Passport API client.
 *
 * One function per route under `/api/passport`, going through `api.ts` so
 * every call inherits credentials, CSRF on mutations, the 401 refresh
 * retry and the compat-generation check. Never call `fetch` directly.
 *
 * Paths are built here and nowhere else. `EXPECTED_PATHS` in
 * `backend/tests/test_passport_api_contract.py` pins every route on the
 * backend side; `PASSPORT_PATHS` below is the mirror of it, exported so a
 * test can assert the two agree rather than leaving a typo to surface as
 * a 404 in front of a user.
 *
 * Three things worth knowing before adding to this file.
 *
 * **There are no export functions.** The plan's API surface lists
 * `export.md`, `export.pdf` and `export.zip`, but no such route exists:
 * `backend/app/features/passport/export.py` builds a zip and is called
 * directly by its tests, never wired to HTTP. Adding client functions for
 * them would fail at runtime.
 *
 * **There is no evidence upload, competency catalogue or shortlist
 * route** either, though schemas for all three exist in
 * `backend/app/schemas/passport.py`. Until a route does, the components
 * that need a competency list read `src/generated/competencies.json`.
 *
 * **The feature gate is not authorisation.** Every route here sits behind
 * `requires_feature("passport")` *and* `access_clinician_passport`, and
 * passing both still says nothing about whether the caller may read a
 * given passport — that comes from being the holder, or from a
 * `passport_signoff_request` row naming them as assessor. A 403 or 404
 * from these functions is the ordinary case for an assessor, not a bug.
 */

import { api } from "@lib/api";
import type {
  AssessorInvite,
  AssessorInviteAccept,
  AssessorInviteAcceptInput,
  AssessorInviteInput,
  AssessorRevoke,
  Certificate,
  CertificateInput,
  CpdEntry,
  CpdEntryInput,
  InboxItem,
  InvitePreview,
  Logbook,
  LogbookEntryInput,
  Passport,
  PassportDetail,
  RecordResult,
  Reflection,
  ReflectionInput,
  RegistrationVerification,
  RegistrationVerifyInput,
  SignOff,
  SignOffDeclineInput,
  SignOffInput,
  SignOffRequestInput,
  SignOffResult,
  Verification,
} from "./types";

/**
 * Every path this client builds, as templates.
 *
 * Mirrors `EXPECTED_PATHS` in the backend's contract test. Kept as
 * literal templates rather than derived from the builders, so the test
 * comparing the two is checking the strings a reader can see rather than
 * re-running the same code that produced them.
 */
export const PASSPORT_PATHS = [
  "/passport",
  "/passport/me",
  "/passport/assessor-invites/accept",
  "/passport/assessor-invites/preview",
  "/passport/assessors/{assessor_user_id}/membership",
  "/passport/assessors/{assessor_user_id}/registration-verification",
  "/passport/requests/inbox",
  "/passport/{passport_id}",
  "/passport/{passport_id}/assessor-invites",
  "/passport/{passport_id}/certificates",
  "/passport/{passport_id}/certificates/{name}",
  "/passport/{passport_id}/competencies/{competency_id}",
  "/passport/{passport_id}/competencies/{competency_id}/requests",
  "/passport/{passport_id}/cpd",
  "/passport/{passport_id}/cpd/{year}",
  "/passport/{passport_id}/cpd/{year}/{stem}",
  "/passport/{passport_id}/logbook/{competency_id}",
  "/passport/{passport_id}/logbook/{competency_id}/{stem}",
  "/passport/{passport_id}/reflections",
  "/passport/{passport_id}/reflections/{name}",
  "/passport/{passport_id}/sign-offs/{signoff_id}",
  "/passport/{passport_id}/sign-offs/{signoff_id}/decline",
  "/passport/{passport_id}/sign-offs/{signoff_id}/sign-off",
  "/passport/{passport_id}/sign-offs/{signoff_id}/verify",
  "/passport/{passport_id}/sign-offs/{signoff_id}/withdraw",
] as const;

/**
 * Escapes a value being interpolated into a path.
 *
 * Passport ids are hex and competency ids are `[a-z0-9_]`, so today none
 * of these need escaping. Record names and filename stems are a different
 * matter: they are derived from human input, and a stray `/` or `?` would
 * silently address a different route. Encoding every segment means that
 * cannot happen, whatever the backend's naming rules become.
 */
function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

// ---------------------------------------------------------------------------
// Passport
// ---------------------------------------------------------------------------

/** Creates the caller's own passport. */
export function createPassport(): Promise<Passport> {
  return api.post<Passport>("/passport");
}

/** The caller's own passport, with derived state per competency. */
export function fetchMyPassport(): Promise<PassportDetail> {
  return api.get<PassportDetail>("/passport/me");
}

/**
 * A passport the caller may read — their own, or one they are a named
 * assessor on. Anyone else is refused, organisation admins included.
 */
export function fetchPassport(passportId: string): Promise<PassportDetail> {
  return api.get<PassportDetail>(`/passport/${segment(passportId)}`);
}

// ---------------------------------------------------------------------------
// Sign-offs
// ---------------------------------------------------------------------------

/**
 * The caller's open requests as an assessor, across every passport.
 *
 * Each item names its passport, which no other sign-off response does:
 * this is the one an assessor reaches without already knowing it.
 */
export function fetchInbox(): Promise<InboxItem[]> {
  return api.get<InboxItem[]>("/passport/requests/inbox");
}

/**
 * The holder asking a named assessor for a sign-off. Writes a `requested`
 * sign-off and the request row the assessor's inbox reads.
 */
export function requestSignOff(
  passportId: string,
  competencyId: string,
  data: SignOffRequestInput,
): Promise<SignOffResult> {
  return api.post<SignOffResult>(
    `/passport/${segment(passportId)}/competencies/${segment(competencyId)}/requests`,
    data,
  );
}

/** One sign-off in full. */
export function fetchSignOff(
  passportId: string,
  signOffId: string,
): Promise<SignOff> {
  return api.get<SignOff>(
    `/passport/${segment(passportId)}/sign-offs/${segment(signOffId)}`,
  );
}

/**
 * The assessor signing.
 *
 * Refused unless `declaration_confirmed` is true, and refused outright if
 * the caller is the holder — self-sign-off is the one hard rule, since
 * the whole value of the record is a second named person.
 */
export function signOff(
  passportId: string,
  signOffId: string,
  data: SignOffInput,
): Promise<SignOffResult> {
  return api.post<SignOffResult>(
    `/passport/${segment(passportId)}/sign-offs/${segment(signOffId)}/sign-off`,
    data,
  );
}

/** The assessor declining, with a reason. Recorded like anything else. */
export function declineSignOff(
  passportId: string,
  signOffId: string,
  data: SignOffDeclineInput,
): Promise<SignOffResult> {
  return api.post<SignOffResult>(
    `/passport/${segment(passportId)}/sign-offs/${segment(signOffId)}/decline`,
    data,
  );
}

/**
 * The holder withdrawing a request they made.
 *
 * Note the backend currently returns `status: "declined"` here while
 * setting the request row to `withdrawn`. Treat the returned status as
 * unreliable for this call and re-read the sign-off if the distinction
 * matters; see the plan's phase 6 notes.
 */
export function withdrawSignOff(
  passportId: string,
  signOffId: string,
): Promise<SignOffResult> {
  return api.post<SignOffResult>(
    `/passport/${segment(passportId)}/sign-offs/${segment(signOffId)}/withdraw`,
  );
}

/**
 * Recomputes a sign-off's hash and reports whether the record is
 * unchanged. Readable by anyone who may read the sign-off.
 */
export function verifySignOff(
  passportId: string,
  signOffId: string,
): Promise<Verification> {
  return api.get<Verification>(
    `/passport/${segment(passportId)}/sign-offs/${segment(signOffId)}/verify`,
  );
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/** Records a certificate. Self-declared: nobody countersigns it. */
export function addCertificate(
  passportId: string,
  data: CertificateInput,
): Promise<RecordResult> {
  return api.post<RecordResult>(
    `/passport/${segment(passportId)}/certificates`,
    data,
  );
}

/** Every certificate on a passport. */
export function fetchCertificates(passportId: string): Promise<Certificate[]> {
  return api.get<Certificate[]>(
    `/passport/${segment(passportId)}/certificates`,
  );
}

/** Corrects a certificate. Self-declared records are editable; sign-offs are not. */
export function amendCertificate(
  passportId: string,
  name: string,
  data: CertificateInput,
): Promise<RecordResult> {
  return api.patch<RecordResult>(
    `/passport/${segment(passportId)}/certificates/${segment(name)}`,
    data,
  );
}

/** Removes a certificate the holder entered in error. */
export function removeCertificate(
  passportId: string,
  name: string,
): Promise<RecordResult> {
  return api.del<RecordResult>(
    `/passport/${segment(passportId)}/certificates/${segment(name)}`,
  );
}

// ---------------------------------------------------------------------------
// Logbook
// ---------------------------------------------------------------------------

/** Adds one procedure to a competency's logbook. */
export function addLogbookEntry(
  passportId: string,
  competencyId: string,
  data: LogbookEntryInput,
): Promise<RecordResult> {
  return api.post<RecordResult>(
    `/passport/${segment(passportId)}/logbook/${segment(competencyId)}`,
    data,
  );
}

/** A competency's logbook: its entries and how many there are, with no target. */
export function fetchLogbook(
  passportId: string,
  competencyId: string,
): Promise<Logbook> {
  return api.get<Logbook>(
    `/passport/${segment(passportId)}/logbook/${segment(competencyId)}`,
  );
}

/** Corrects a logbook entry — a mistyped date should be fixable in seconds. */
export function amendLogbookEntry(
  passportId: string,
  competencyId: string,
  stem: string,
  data: LogbookEntryInput,
): Promise<RecordResult> {
  return api.patch<RecordResult>(
    `/passport/${segment(passportId)}/logbook/${segment(competencyId)}/${segment(stem)}`,
    data,
  );
}

/** Removes a logbook entry. */
export function removeLogbookEntry(
  passportId: string,
  competencyId: string,
  stem: string,
): Promise<RecordResult> {
  return api.del<RecordResult>(
    `/passport/${segment(passportId)}/logbook/${segment(competencyId)}/${segment(stem)}`,
  );
}

// ---------------------------------------------------------------------------
// Reflections
//
// Holder-only, every one of these. Not readable by an assessor, an
// organisation admin or anyone else. Written reflection can be disclosed
// in legal proceedings, so the narrower default is the safer one.
// ---------------------------------------------------------------------------

/**
 * Writes a reflection. `anonymised_confirmed` must be true — reflections
 * are one of only two places patient data could enter a passport.
 */
export function addReflection(
  passportId: string,
  data: ReflectionInput,
): Promise<RecordResult> {
  return api.post<RecordResult>(
    `/passport/${segment(passportId)}/reflections`,
    data,
  );
}

/** The holder's own reflections. Nobody else may read these. */
export function fetchReflections(passportId: string): Promise<Reflection[]> {
  return api.get<Reflection[]>(`/passport/${segment(passportId)}/reflections`);
}

/** Rewrites a reflection. */
export function amendReflection(
  passportId: string,
  name: string,
  data: ReflectionInput,
): Promise<RecordResult> {
  return api.patch<RecordResult>(
    `/passport/${segment(passportId)}/reflections/${segment(name)}`,
    data,
  );
}

/** Removes a reflection. */
export function removeReflection(
  passportId: string,
  name: string,
): Promise<RecordResult> {
  return api.del<RecordResult>(
    `/passport/${segment(passportId)}/reflections/${segment(name)}`,
  );
}

// ---------------------------------------------------------------------------
// CPD
// ---------------------------------------------------------------------------

/** Records one CPD activity. */
export function addCpdEntry(
  passportId: string,
  data: CpdEntryInput,
): Promise<RecordResult> {
  return api.post<RecordResult>(`/passport/${segment(passportId)}/cpd`, data);
}

/**
 * A year's CPD activities. Grouped by year because UK appraisal runs
 * annually and asks what you did this year.
 */
export function fetchCpdYear(
  passportId: string,
  year: number,
): Promise<CpdEntry[]> {
  return api.get<CpdEntry[]>(
    `/passport/${segment(passportId)}/cpd/${segment(year)}`,
  );
}

/** Corrects a CPD activity. */
export function amendCpdEntry(
  passportId: string,
  year: number,
  stem: string,
  data: CpdEntryInput,
): Promise<RecordResult> {
  return api.patch<RecordResult>(
    `/passport/${segment(passportId)}/cpd/${segment(year)}/${segment(stem)}`,
    data,
  );
}

/** Removes a CPD activity. */
export function removeCpdEntry(
  passportId: string,
  year: number,
  stem: string,
): Promise<RecordResult> {
  return api.del<RecordResult>(
    `/passport/${segment(passportId)}/cpd/${segment(year)}/${segment(stem)}`,
  );
}

// ---------------------------------------------------------------------------
// External assessors
// ---------------------------------------------------------------------------

/**
 * Invites somebody from outside to assess. Rate limited by the backend,
 * which answers 429 once a passport has issued too many in a day.
 */
export function inviteAssessor(
  passportId: string,
  data: AssessorInviteInput,
): Promise<AssessorInvite> {
  return api.post<AssessorInvite>(
    `/passport/${segment(passportId)}/assessor-invites`,
    data,
  );
}

/** Invitations issued for this passport. Carries no token and no link. */
export function fetchAssessorInvites(
  passportId: string,
): Promise<AssessorInvite[]> {
  return api.get<AssessorInvite[]>(
    `/passport/${segment(passportId)}/assessor-invites`,
  );
}

/**
 * What an invitation link resolves to, before anybody commits to
 * anything. Public: no session is needed, the signed token stands in for
 * one, and reading an invitation does not consume it.
 */
export function previewAssessorInvite(token: string): Promise<InvitePreview> {
  return api.get<InvitePreview>(
    `/passport/assessor-invites/preview?token=${encodeURIComponent(token)}`,
  );
}

/**
 * Accepts an invitation, which is what consumes it. Public, for the same
 * reason as the preview. Send `username` and `password` only when the
 * preview said `needs_account`.
 */
export function acceptAssessorInvite(
  data: AssessorInviteAcceptInput,
): Promise<AssessorInviteAccept> {
  return api.post<AssessorInviteAccept>(
    "/passport/assessor-invites/accept",
    data,
  );
}

/**
 * An organisation admin recording that they checked a register by hand.
 * Quill checks no register itself.
 */
export function verifyAssessorRegistration(
  assessorUserId: number,
  data: RegistrationVerifyInput,
): Promise<RegistrationVerification> {
  return api.post<RegistrationVerification>(
    `/passport/assessors/${segment(assessorUserId)}/registration-verification`,
    data,
  );
}

/**
 * Removes an assessor's membership, taking their reach with it. Sign-offs
 * they already made stand — `sign_offs_kept` says how many.
 */
export function revokeAssessorMembership(
  assessorUserId: number,
): Promise<AssessorRevoke> {
  return api.del<AssessorRevoke>(
    `/passport/assessors/${segment(assessorUserId)}/membership`,
  );
}
