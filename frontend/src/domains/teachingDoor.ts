/**
 * Letting people into teaching at an org_unit, and out again.
 *
 * The client for the door routes, `/api/teaching/admin/org-units/...`.
 * Teaching has three layers: a competency, a place and an enrolment.
 * `admit` gives all three and `unenrol` ends one enrolment. `access`
 * says, for each module, which layer somebody is missing.
 */

import { api } from "@/lib/api";

/** The layers `access` may name as missing. */
export type MissingLayer = "competency" | "place" | "enrolment";

export interface ServedModules {
  /** The organisation above the org_unit asked about, or null for none */
  organisation_id: number | null;
  organisation_name: string | null;
  modules: { question_bank_id: string; title: string }[];
}

export interface ModuleAccess {
  question_bank_id: string;
  title: string;
  may_enter: boolean;
  missing: MissingLayer[];
  /** When their current enrolment ends, or null for none or no end */
  enrolment_ends_on: string | null;
}

export interface Admitted {
  competencies: string[];
  place: boolean;
  enrolled: string[];
}

export const teachingDoor = {
  /** The modules the organisation above an org_unit serves. */
  modules: (unitId: number) =>
    api.get<ServedModules>(`/teaching/admin/org-units/${unitId}/modules`),

  /** One member's way into each module, and what is missing. */
  access: (unitId: number, userId: number) =>
    api.get<{ modules: ModuleAccess[] }>(
      `/teaching/admin/org-units/${unitId}/members/${userId}/access`,
    ),

  /** Give a member the competencies, the place here and the enrolments. */
  admit: (
    unitId: number,
    userId: number,
    moduleIds: string[],
    endsOn: string | null = null,
  ) =>
    api.post<Admitted>(
      `/teaching/admin/org-units/${unitId}/members/${userId}/admit`,
      { module_ids: moduleIds, ends_on: endsOn },
    ),

  /** End a member's enrolment on one module. */
  unenrol: (unitId: number, userId: number, moduleId: string) =>
    api.post<{ withdrawn: number }>(
      `/teaching/admin/org-units/${unitId}/members/${userId}/unenrol`,
      { module_id: moduleId },
    ),
};
