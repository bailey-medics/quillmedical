/**
 * Passport API types.
 *
 * Mirrors the Pydantic schemas in `backend/app/schemas/passport.py` —
 * the API contract, deliberately separate from the record model in
 * `backend/app/features/passport/schemas.py` that describes what a
 * passport *file* holds. The two look alike today and are expected to
 * diverge, so these follow the wire and nothing else.
 *
 * Two shapes carry through from the record model and matter here too.
 *
 * **The human label travels beside every identifier.** A competency
 * arrives as id *and* name, a level as id *and* wording, so a component
 * renders a passport without holding the catalogue.
 *
 * **Counts, never comparisons.** `logbook_entries` and `LogbookOut.count`
 * are counts with no target, no percentage and no ready-or-not verdict
 * anywhere in these types. How many is enough is the assessor's
 * judgement, and a type that carried a target would invite a progress
 * bar to be built against it.
 *
 * Dates and timestamps arrive as ISO strings, not `Date`. Pydantic
 * serialises `date` as `YYYY-MM-DD` and `datetime` as ISO 8601; parsing
 * them here would guess at a timezone the backend did not state. Fields
 * typed `IsoDate` carry no time of day at all — `performed_on` is a day
 * because nobody recalls whether a procedure was at 09:30 or 11:00.
 */

/** A calendar day, `YYYY-MM-DD`. No time, and deliberately so. */
export type IsoDate = string;

/** An ISO 8601 timestamp. */
export type IsoDateTime = string;

// ---------------------------------------------------------------------------
// Closed vocabularies
//
// Imported from the record model on the backend rather than restated, and
// mirrored here for the same reason: a second copy drifts, and a value
// accepted on disk but refused at the door is a bug nobody sees until a
// user hits it.
// ---------------------------------------------------------------------------

/**
 * What a sign-off can be. `requested` exists because the record is written
 * when the holder asks, not when the assessor signs — the request is part
 * of the history rather than a row that vanishes.
 */
export type SignOffStatus =
  "requested" | "signed_off" | "declined" | "superseded";

/**
 * Why a later sign-off exists. Only `correction` supersedes anything:
 * conflating progression with correction would quietly imply an assessor
 * had got something wrong when they had not.
 */
export type SignOffKind =
  "initial" | "progression" | "reassessment" | "correction";

/**
 * What the assessor actually did. Three clinically different acts, and a
 * record that does not say which one happened is weaker than it looks.
 */
export type SignOffMeaning =
  "directly observed" | "reviewed evidence" | "countersigned";

/** Whether a logged procedure was supervised, from the holder's own view. */
export type Supervision = "supervised" | "independent";

/** What a CPD activity was. */
export type CpdActivityType =
  "conference" | "grand round" | "teaching day" | "course" | "other";

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** A competency, by id and by the words shown at the time. */
export interface CompetencyRef {
  id: string;
  name: string;
}

/** One step on a competency's scale, as it read at the time. */
export interface LevelRef {
  id: string;
  name: string;
}

/**
 * A professional registration, as declared. `verified` is false until an
 * organisation admin has checked a register by hand — Quill checks none
 * itself, and the type says so rather than implying otherwise.
 */
export interface Registration {
  body: string;
  number: string;
  verified: boolean;
  verified_by: string | null;
  verified_on: IsoDate | null;
}

/**
 * One piece of evidence, named by the hash of its own bytes. The hash is
 * the only pointer; the filename is data, never a path.
 */
export interface Attachment {
  hash: string;
  filename: string;
  size_bytes: number;
  media_type: string;
}

/**
 * Who signed, frozen as they were at the moment of signing. A snapshot
 * rather than a live reference: an assessor's role changes and their
 * registrations lapse, and none of that may rewrite what a record said.
 */
export interface Assessor {
  user_id: string;
  name: string;
  role: string;
  registrations: Registration[];
  registration_verified: boolean;
  care_location: string | null;
}

/**
 * What was in front of the assessor when they decided. Not a threshold
 * that was met — the passport never judges sufficiency — but a record of
 * what the evidence looked like at that moment.
 */
export interface EvidenceSnapshot {
  logbook_entries: number;
  logbook_digest: string | null;
  certificates: string[];
}

// ---------------------------------------------------------------------------
// Passport
// ---------------------------------------------------------------------------

/** A passport's identity and whose it is. */
export interface Passport {
  passport_id: string;
  holder_user_id: string;
  holder_name: string;
  registrations: Registration[];
  created_at: IsoDate;
  head_commit: string | null;
}

/**
 * One competency's state, from the derived index.
 *
 * `expires_on` is reported and nothing acts on it: what a lapsed sign-off
 * implies is a clinical decision that has not been made, so the date is
 * there to be read by somebody who can judge it. Do not build an
 * "expired" badge off this without that decision being taken first.
 */
export interface CompetencyState {
  id: string;
  name: string;
  status: SignOffStatus;
  level: LevelRef | null;
  signed_on: IsoDate | null;
  signed_off_by: string | null;
  expires_on: IsoDate | null;
  sign_off: string | null;
  previous_sign_offs: string[];
  logbook_entries: number;
  certificates: string[];
}

/** A passport with every competency it holds evidence for. */
export interface PassportDetail {
  passport: Passport;
  competencies: CompetencyState[];
}

// ---------------------------------------------------------------------------
// Sign-offs
// ---------------------------------------------------------------------------

/**
 * One sign-off in full.
 *
 * `kind` is derived by the backend rather than chosen by a caller, so
 * there is no field for it on the request types below.
 */
export interface SignOff {
  name: string;
  id: string;
  competency: CompetencyRef;
  kind: SignOffKind;
  status: SignOffStatus;
  level: LevelRef | null;
  observed_on: IsoDate;
  signed_at: IsoDateTime | null;
  expires_on: IsoDate | null;
  signed_off_by: Assessor | null;
  meaning: SignOffMeaning | null;
  comments: string | null;
  corrects: string | null;
  evidence: EvidenceSnapshot | null;
  attachments: Attachment[];
  content_hash: string | null;
}

/**
 * One open request, with the passport it belongs to.
 *
 * The inbox is the only sign-off response that names its passport,
 * because it is the only one whose caller does not already know it:
 * every other sign-off route takes the passport id in its path.
 */
export interface InboxItem {
  passport_id: string;
  sign_off: SignOff;
}

/**
 * The holder asking for a sign-off.
 *
 * `assessor_email` names who is being asked. An address rather than an
 * account, because the assessor who observed the work may have no Quill
 * account yet — they are emailed, and sign in or register to sign. The
 * holder chooses, because the judgement about who is appropriate
 * belongs to them and their supervisor. The one rule the API enforces
 * is that it may not be the holder themselves.
 */
/**
 * Evidence a record is about to name.
 *
 * The same four fields the record stores. A blob is bytes at a path
 * named by their hash and nothing beside it records what the file was
 * called, so the uploader says: `uploadEvidence` returns exactly this
 * shape, and it is passed straight back when the record is written.
 */
export interface AttachmentInput {
  hash: string;
  filename: string;
  size_bytes: number;
  media_type: string;
}

/**
 * Somebody on Quill who might be the assessor being named.
 *
 * `registrations` is what the person states, never what Quill checked —
 * `verified` says whether an organisation admin has looked at a
 * register. A screen showing a number beside a name must say which it
 * is, or it reads as confirmation nobody gave.
 */
export interface AssessorMatch {
  user_id: number;
  username: string;
  full_name: string | null;
  email: string;
  registrations: Registration[];
}

/**
 * What a search for an assessor found.
 *
 * Empty is an ordinary answer, not an error: asking somebody who has
 * never used Quill is the case the flow exists for.
 */
export interface AssessorSearch {
  matches: AssessorMatch[];
}

export interface SignOffRequestInput {
  assessor_email: string;
  observed_on: IsoDate;
  level_id?: string | null;
  comments?: string | null;
  reflection?: string | null;
  attachments?: AttachmentInput[];
}

/**
 * The assessor signing.
 *
 * `declaration_confirmed` must be true: it is what makes signing a
 * deliberate act rather than a click. The route refuses without it and
 * writes nothing, so never default it to true in a form.
 */
export interface SignOffInput {
  meaning: SignOffMeaning;
  declaration_confirmed: boolean;
  level_id?: string | null;
  comments?: string | null;
  assessment?: string | null;
}

/** The assessor declining, with a reason. A decline is recorded like anything else. */
export interface SignOffDeclineInput {
  reason: string;
}

/** What a write to a sign-off produced. */
export interface SignOffResult {
  name: string;
  status: SignOffStatus;
  commit: string;
}

/**
 * Whether a sign-off still matches its own fingerprint.
 *
 * `proves` and `does_not_prove` are text because the limits matter as
 * much as the result, and both should be shown to the reader rather than
 * summarised into a tick. A match shows the record has not changed since
 * it was written; it does not prove a professional registration, and it
 * proves nothing to a reader who distrusts Quill.
 */
export interface Verification {
  name: string;
  unchanged: boolean;
  content_hash: string | null;
  recomputed_hash: string | null;
  proves: string;
  does_not_prove: string;
}

/**
 * A file that has been stored, and the hash a record names it by.
 *
 * Passed straight back into the record being written: this is the only
 * place the filename and media type exist, because a blob is bytes at a
 * path named by their hash and nothing beside it records what the file
 * was called.
 */
export interface EvidenceUpload {
  hash: string;
  filename: string;
  size_bytes: number;
  media_type: string;
}

// ---------------------------------------------------------------------------
// Self-declared evidence
//
// Certificates, logbook entries, reflections and CPD are the holder's own
// claims, entered by them alone and countersigned by nobody. A sign-off is
// a second person accepting accountability. Keeping the two visibly apart
// is the whole point, so do not render these through the same component as
// a SignOff.
// ---------------------------------------------------------------------------

/** A course, qualification or award the holder is claiming. */
export interface CertificateInput {
  title: string;
  issuer: string;
  awarded_on: IsoDate;
  expires_on?: IsoDate | null;
  competencies?: string[];
  description?: string | null;
  attachments?: AttachmentInput[];
}

/** A certificate as stored. */
export interface Certificate {
  name: string;
  id: string;
  title: string;
  issuer: string;
  awarded_on: IsoDate;
  expires_on: IsoDate | null;
  competencies: CompetencyRef[];
  description: string | null;
  attachments: Attachment[];
}

/** One procedure, as the holder recorded it. */
export interface LogbookEntryInput {
  performed_on: IsoDate;
  setting?: string | null;
  supervision?: Supervision | null;
  supervisor?: string | null;
  indication?: string | null;
  outcome?: string | null;
  notes?: string | null;
  also_counts_towards?: string[];
  attachments?: AttachmentInput[];
}

/** A logbook entry as stored. */
export interface LogbookEntry {
  filename: string;
  competency: string;
  performed_on: IsoDate;
  setting: string | null;
  supervision: Supervision | null;
  supervisor: string | null;
  indication: string | null;
  outcome: string | null;
  notes: string | null;
  also_counts_towards: string[];
  attachments: Attachment[];
}

/**
 * A competency's logbook entries, and how many there are.
 *
 * A count and no target, deliberately. Two hundred bronchoscopies prove
 * activity, not competence.
 */
/** Every logged procedure, grouped by the competency it counts towards. */
export interface WholeLogbook {
  competencies: Logbook[];
  count: number;
}

export interface Logbook {
  competency: string;
  count: number;
  entries: LogbookEntry[];
}

/**
 * A reflection on a case, a complaint or a significant event.
 *
 * Holder-only, and excluded from every other reader including
 * organisation admins. `anonymised_confirmed` must be true: reflections
 * are written about real cases and are one of only two places patient
 * data could enter a passport.
 */
export interface ReflectionInput {
  title: string;
  written_on: IsoDate;
  body: string;
  anonymised_confirmed: boolean;
  competencies?: string[];
  attachments?: AttachmentInput[];
}

/** A reflection as stored, with its prose. */
export interface Reflection {
  name: string;
  title: string;
  written_on: IsoDate;
  body: string;
  competencies: CompetencyRef[];
  attachments: Attachment[];
}

/** One continuing professional development activity. */
export interface CpdEntryInput {
  activity_on: IsoDate;
  title: string;
  activity_type: CpdActivityType;
  points?: number | null;
  competencies?: string[];
  certificate?: string | null;
  notes?: string | null;
  attachments?: AttachmentInput[];
}

/** A CPD activity as stored. */
export interface CpdEntry {
  filename: string;
  year: number;
  activity_on: IsoDate;
  title: string;
  activity_type: CpdActivityType;
  points: number | null;
  competencies: CompetencyRef[];
  certificate: string | null;
  notes: string | null;
  attachments: Attachment[];
}

/** What a write to a self-declared record produced. */
export interface RecordResult {
  name: string;
  commit: string;
}

// ---------------------------------------------------------------------------
// External assessors
// ---------------------------------------------------------------------------

/**
 * The holder bringing in somebody from outside.
 *
 * The registration is what the holder was told, not something Quill has
 * checked. `competency_id` writes a more specific email and is
 * deliberately not stored: an invitation brings a *person* onto the
 * platform, and one assessor goes on to sign off many competencies.
 */
export interface AssessorInviteInput {
  email: string;
  name: string;
  registration_authority: string;
  registration_number: string;
  competency_id?: string | null;
}

/**
 * An invitation that has been issued.
 *
 * No token and no link, deliberately: returning the credential would let
 * a holder pass it on by any route they liked, defeating the point of
 * sending it to a verified address.
 */
export interface AssessorInvite {
  id: string;
  email: string;
  name: string;
  created_at: IsoDateTime;
  expires_at: IsoDateTime;
  accepted_at: IsoDateTime | null;
}

/**
 * What the accept page shows before anybody commits to anything.
 *
 * Reading an invitation is not accepting it, so this may be fetched as
 * often as the assessor likes for the whole fourteen days.
 * `needs_account` chooses between a registration form and a sign-in
 * prompt; `already_accepted` means the invitation has done its job, and
 * the page should send them to sign in rather than show an error.
 */
export interface InvitePreview {
  holder_name: string;
  assessor_name: string;
  email: string;
  expires_at: IsoDateTime;
  needs_account: boolean;
  already_accepted: boolean;
}

/**
 * Finishing registration, which is what consumes the invitation.
 *
 * `username` and `password` are required only when the invitation
 * resolves to somebody without an account — see `needs_account` on the
 * preview. An assessor who already uses Quill sends the token alone.
 *
 * So are the name and registration, and for the same reason. The holder
 * asking for a sign-off gives an address and nothing else, so nobody
 * has told Quill who this person is until they say so — and a
 * registration number is worth more from its holder than from somebody
 * who half-remembered it. An assessor who already has an account has
 * these on it already.
 */
export interface AssessorInviteAcceptInput {
  token: string;
  username?: string | null;
  password?: string | null;
  full_name?: string | null;
  registration_authority?: string | null;
  registration_number?: string | null;
}

/**
 * The outcome of accepting. `status` is `registered` when an account was
 * created and `linked` when an existing one was used.
 */
export interface AssessorInviteAccept {
  status: string;
  user_id: number;
  place: string;
  place_id: number;
}

/** An admin recording that they checked a register by hand. */
export interface RegistrationVerifyInput {
  registration_authority: string;
  registration_number: string;
}

/**
 * One recorded check. Who made it and when travel with the flag, because
 * a check that does not say who looked records only that somebody did.
 */
export interface RegistrationVerification {
  user_id: number;
  registration_authority: string;
  registration_number: string;
  verified_by_name: string;
  verified_at: IsoDateTime;
  /**
   * The place of the organisation whose admin checked it. Replaces
   * `organisation_id`, which counted in the organisations table's own
   * ids; membership answers in place ids now.
   */
  org_unit_id: number;
}

/**
 * What removing an assessor's membership did.
 *
 * `sign_offs_kept` is never zero by design: revoking removes their reach,
 * and the sign-offs they already made stand. Show it on the confirmation
 * rather than making an admin trust it.
 */
export interface AssessorRevoke {
  user_id: number;
  place: string;
  /**
   * A place id whichever kind `place` says. It used to hold the
   * organisation's own id when `place` was `organisation`, which the
   * name never said.
   */
  place_id: number;
  sign_offs_kept: number;
}
