/**
 * The clinical feature's one lazy chunk: every page routed under
 * `<RequireClinical>` in `routes.tsx`.
 *
 * The routes all load this module through `loadClinical` in
 * `featureChunks.ts`, so the feature is one download on the way in and
 * none after. Opening a message thread must never need a fetch: those
 * routes hold a draft and cannot safely reload if one fails.
 *
 * The page files stay where they are in `pages/`. A page added to the
 * clinical subtree is exported from here, never given a `lazy` of its own.
 */

export { default as MessageThread } from "../MessageThread";
export { default as Messages } from "../Messages";
export { default as Patient } from "../Patient";
export { default as PatientAppointments } from "../PatientAppointments";
export { default as PatientDocuments } from "../PatientDocuments";
export { default as PatientDocumentView } from "../PatientDocumentView";
export { default as PatientLetters } from "../PatientLetters";
export { default as PatientLetterView } from "../PatientLetterView";
export { default as PatientMessages } from "../PatientMessages";
export { default as PatientMessageThread } from "../PatientMessageThread";
export { default as PatientNotes } from "../PatientNotes";
