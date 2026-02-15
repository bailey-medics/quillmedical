// frontend/src/types/cbac.ts

import competenciesData from "../generated/competencies.json";
import baseProfessionsData from "../generated/base-professions.json";

// Infer competency types from generated JSON
export type CompetencyId = (typeof competenciesData.competencies)[number]["id"];
export type Competency = (typeof competenciesData.competencies)[number];
export type BaseProfessionId =
  (typeof baseProfessionsData.base_professions)[number]["id"];
export type BaseProfession =
  (typeof baseProfessionsData.base_professions)[number];

// System permission levels
export type SystemPermission = "patient" | "staff" | "admin" | "superadmin";

// Type guard
export function isCompetencyId(value: string): value is CompetencyId {
  return competenciesData.competencies.some((c: Competency) => c.id === value);
}

// Competency lookup
export function getCompetencyDetails(id: CompetencyId): Competency | undefined {
  return competenciesData.competencies.find((c: Competency) => c.id === id);
}

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
