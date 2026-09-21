// frontend/src/types/cbac.ts

import competenciesData from "../generated/competencies.json";
import baseProfessionsData from "../generated/base-professions.json";

// Infer competency types from generated JSON
export type CompetencyId = (typeof competenciesData.competencies)[number]["id"];

/**
 * One entry in the generated catalogue.
 *
 * Declared rather than inferred from the JSON. Inference gave the union
 * of the shapes that happened to be in the file, so the first entry to
 * carry `retired_on` split the type in three and every
 * `(c: Competency) => ...` callback stopped matching. The fields below
 * are optional in the source YAML, so they are optional here whether or
 * not any entry currently uses them.
 */
export interface CompetencyLevel {
  id: string;
  name: string;
}

export interface Competency {
  id: string;
  display_name: string;
  /** Set once a competency is retired. Retired ids stay readable and
   *  cannot be granted again. */
  retired_on?: string;
  /** Present only where a competency is signed off against a scale. */
  levels?: CompetencyLevel[];
  expires_after_months?: number;
}
export type BaseProfessionId =
  (typeof baseProfessionsData.base_professions)[number]["id"];
export type BaseProfession =
  (typeof baseProfessionsData.base_professions)[number];

// System permission levels

// Type guard
export function isCompetencyId(value: string): value is CompetencyId {
  return competenciesData.competencies.some((c: Competency) => c.id === value);
}

// Competency lookup
export function getCompetencyDetails(id: CompetencyId): Competency | undefined {
  return competenciesData.competencies.find((c: Competency) => c.id === id);
}

/**
 * Every competency, retired ones included.
 *
 * Reads and lookups use this, so nothing already granted becomes
 * unreadable when a competency is retired. Mirrors `COMPETENCY_IDS` in
 * `backend/app/cbac/competencies.py`.
 */
export const ALL_COMPETENCIES: Competency[] =
  competenciesData.competencies as Competency[];

/**
 * The competencies still available to grant.
 *
 * Anything offering a choice uses this. The API refuses a retired id at
 * the write boundary, so listing one gives an admin something they can
 * select and cannot save, with a validation error they can do nothing
 * about. Mirrors `ACTIVE_COMPETENCY_IDS` in
 * `backend/app/cbac/competencies.py`.
 */
export const ACTIVE_COMPETENCIES: Competency[] = ALL_COMPETENCIES.filter(
  (competency) => competency.retired_on === undefined,
);

// Profession lookup
export function getBaseProfessionDetails(
  id: BaseProfessionId,
): BaseProfession | undefined {
  return baseProfessionsData.base_professions.find(
    (p: BaseProfession) => p.id === id,
  );
}

// API response types
export interface UserCompetencies {
  user_id: number;
  username: string;
  base_profession: BaseProfessionId;
  additional_competencies: CompetencyId[];
  removed_competencies: CompetencyId[];
  final_competencies: CompetencyId[];
}
