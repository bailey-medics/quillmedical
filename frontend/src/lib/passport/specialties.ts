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

/** Every specialty a holder may choose, in filename order. */
export const PASSPORT_SPECIALTIES: PassportSpecialtyDefinition[] =
  specialtiesData.specialties;

/** The specialty with this id, or undefined if there is no such file. */
export function getPassportSpecialty(
  id: string,
): PassportSpecialtyDefinition | undefined {
  return PASSPORT_SPECIALTIES.find((specialty) => specialty.id === id);
}
