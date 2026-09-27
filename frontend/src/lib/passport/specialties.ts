/**
 * The passport specialties, from `shared/passport-specialties/`.
 *
 * A holder's specialties order their competency picker and do nothing
 * else: every assessable competency stays available whatever they chose.
 * Generic, the empty choice, means no specialty order at all.
 *
 * Read from the generated bundle, the same way the competency catalogue
 * is. The backend checks every list at startup, so the lists here are
 * already known to name only competencies that exist and are assessable.
 */

import specialtiesData from "@/generated/passport-specialties.json";

/** One specialty, as `shared/passport-specialties/` defines it. */
export interface PassportSpecialtyDefinition {
  id: string;
  display_name: string;
  /** Competency ids to list first, in this order. */
  common_competencies: string[];
}

/**
 * Every specialty a holder may choose, alphabetically by display name.
 *
 * Alphabetical because it is the default for everybody: no specialty is
 * put first for all organisations because one organisation wants it
 * first. An organisation's own lead specialties go on top of this order.
 */
export const PASSPORT_SPECIALTIES: PassportSpecialtyDefinition[] = [
  ...specialtiesData.specialties,
].sort((a, b) =>
  a.display_name.localeCompare(b.display_name, "en-GB", {
    sensitivity: "base",
  }),
);

/**
 * One specialty as the specialty field offers it: an id and the name to
 * show. Both the bundle's definitions and the API's choices fit it.
 */
export type SpecialtyOption = Pick<
  PassportSpecialtyDefinition,
  "id" | "display_name"
>;

/** The specialty with this id, or undefined if there is no such file. */
export function getPassportSpecialty(
  id: string,
): PassportSpecialtyDefinition | undefined {
  return PASSPORT_SPECIALTIES.find((specialty) => specialty.id === id);
}
