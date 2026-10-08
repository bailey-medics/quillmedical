/**
 * Passport API client and types.
 *
 * Import from `@lib/passport` rather than reaching into `./api` or
 * `./types` directly, so the module's surface is one org_unit and a later
 * reshuffle of the files inside it stays invisible to callers.
 */

export {
  PASSPORT_PATHS,
  acceptAssessorInvite,
  addCertificate,
  addCpdEntry,
  addLogbookEntry,
  addReflection,
  amendCertificate,
  certificateAttachmentUrl,
  amendCpdEntry,
  amendLogbookEntry,
  answerLogbookConfirmation,
  fetchLogbookConfirmation,
  amendReflection,
  createPassport,
  declineSignOff,
  exportBundle,
  exportMarkdown,
  exportPdf,
  fetchCertificates,
  uploadEvidence,
  fetchAppraisalPeriods,
  fetchAllCpd,
  fetchCpdYear,
  fetchInbox,
  fetchLogbook,
  fetchWholeLogbook,
  fetchMyPassport,
  fetchPassport,
  fetchPassportFrameworks,
  fetchReflections,
  fetchSignOff,
  fetchSignOffs,
  previewAssessorInvite,
  removeCertificate,
  removeCpdEntry,
  removeLogbookEntry,
  removeReflection,
  requestSignOff,
  searchAssessors,
  revokeAssessorMembership,
  saveAppraisalPeriods,
  setPassportFrameworks,
  signOff,
  withdrawSignOff,
} from "./api";

export type {
  Assessor,
  AssessorInviteAccept,
  AssessorInviteAcceptInput,
  AssessorRevoke,
  Attachment,
  AttachmentInput,
  Certificate,
  CertificateInput,
  CompetencyRef,
  CompetencyState,
  CpdActivityType,
  CpdEntry,
  CpdEntryInput,
  EvidenceSnapshot,
  FrameworkChoice,
  FrameworkRef,
  EvidenceUpload,
  InvitePreview,
  IsoDate,
  IsoDateTime,
  LevelRef,
  Logbook,
  WholeLogbook,
  LogbookEntry,
  LogbookConfirmation,
  LogbookConfirmationAnswer,
  LogbookEntryInput,
  Passport,
  PassportDetail,
  InboxItem,
  RecordResult,
  Reflection,
  ReflectionInput,
  Registration,
  SignOff,
  SignOffDeclineInput,
  SignOffInput,
  SignOffKind,
  SignOffMeaning,
  AssessorMatch,
  AssessorSearch,
  SignOffRequestInput,
  SignOffResult,
  SignOffStatus,
  Supervision,
  AppraisalPeriod,
} from "./types";

export {
  describeLength,
  formatDay,
  juneToJuneYears,
  labelPeriods,
  monthsIn,
  newestFirst,
  periodContains,
  periodKey,
  samePeriod,
} from "./appraisalPeriods";
export { RECORD_KIND_LABELS, collectRecords } from "./recordList";
export type {
  PassportRecord,
  PassportRecordKind,
  RecordSources,
} from "./recordList";
export { levelsFor } from "./levels";
export type { LevelOption } from "./levels";
export { nameWithScope, scopesFor } from "./scopes";
export type { ScopeOption } from "./scopes";
export { registrationAuthorities } from "./registrationAuthorities";
export type { RegistrationAuthorityOption } from "./registrationAuthorities";
