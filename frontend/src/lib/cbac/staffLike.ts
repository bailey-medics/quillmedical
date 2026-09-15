/**
 * What counts as "something a member of staff would hold".
 *
 * The staff picker used to be filtered by `?permission_level=staff`,
 * which answered this question with the column that no longer exists.
 * No replacement filter was right: every candidate hid the patient
 * becoming a healthcare assistant, which is the case the picker most
 * needs to support.
 *
 * So the list shows everyone, and the judgement moved into the
 * interface. It asks — are you sure? — rather than refusing, and offers
 * to grant what is missing in the same step.
 *
 * **Defined as the complement of the two patient-side competencies**,
 * not as a list of staff ones. A list would need editing every time a
 * competency was added to the catalogue, and the failure would be
 * silent: a new clinical competency nobody added here would make its
 * holders look like patients. There are only ever two competencies on
 * the other side, and adding a third is a deliberate act that will
 * reach this file.
 */

/**
 * Competencies that do not, on their own, make somebody staff.
 *
 * - `access_own_patient_records` — the `patient` profession's whole
 *   grant: this person may read their own record and nothing else.
 * - `access_granted_patient_records` — held by `patient_advocate` and
 *   `external_hcp`, who read records they have been granted
 *   individually. Being an advocate for a relative does not make
 *   somebody staff at the trust.
 */
export const PATIENT_SIDE_COMPETENCIES = [
  "access_own_patient_records",
  "access_granted_patient_records",
] as const;

/**
 * Does this person hold anything a member of staff would?
 *
 * Someone with no competencies at all returns `false` — they hold
 * nothing staff-like, which is the same answer and the same prompt.
 *
 * @param competencies - Resolved competency IDs, as `/users` returns them
 * @returns True if at least one competency is not patient-side
 */
export function holdsStaffLikeCompetency(competencies: string[]): boolean {
  return competencies.some(
    (id) => !(PATIENT_SIDE_COMPETENCIES as readonly string[]).includes(id),
  );
}
