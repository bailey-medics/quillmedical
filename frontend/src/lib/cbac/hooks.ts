// frontend/src/lib/cbac/hooks.ts
/**
 * CBAC Permission Hooks
 *
 * React hooks for checking user competencies in components.
 * Integrates with AuthContext and provides simple boolean checks.
 */

import { useAuth } from "../../auth/AuthContext";
import type { CompetencyId } from "@/types/cbac";

/**
 * Check if current user has a specific competency
 *
 * @param competency - Competency ID to check
 * @returns true if user has the competency
 *
 * @example
 * const canPrescribe = useHasCompetency("prescribe_controlled_schedule_2");
 * if (!canPrescribe) return null; // Hide component
 */
export function useHasCompetency(competency: CompetencyId): boolean {
  const { state } = useAuth();
  if (state.status !== "authenticated") return false;
  return state.user.competencies?.includes(competency) ?? false;
}

/**
 * Check if user has ANY of the specified competencies
 *
 * @param competencies - List of competency IDs (user needs at least one)
 * @returns true if user has at least one competency
 */
export function useHasAnyCompetency(...competencies: CompetencyId[]): boolean {
  const { state } = useAuth();
  if (state.status !== "authenticated") return false;
  const userComps = state.user.competencies ?? [];
  return competencies.some((c) => userComps.includes(c));
}

/**
 * Check if user has ALL of the specified competencies
 *
 * @param competencies - List of competency IDs (user needs all)
 * @returns true if user has all competencies
 */
export function useHasAllCompetencies(
  ...competencies: CompetencyId[]
): boolean {
  const { state } = useAuth();
  if (state.status !== "authenticated") return false;
  const userComps = state.user.competencies ?? [];
  return competencies.every((c) => userComps.includes(c));
}

/** What the signed-in user may hand out to other people. */
export interface GrantScope {
  /** Whether they may grant or remove this competency. */
  mayGrant: (competency: string) => boolean;
  /** Whether they may give somebody this base profession. */
  mayAssignProfession: (profession: string) => boolean;
}

/**
 * What the signed-in user may grant, from their `/auth/me` response.
 *
 * A holder of `manage_users` has no limit, which the server sends as
 * null. A holder of `manage_teaching` alone may grant only the teaching
 * competencies and give only the teaching professions. The pickers ask
 * this so they offer what the API will accept, rather than working the
 * whitelist out again in the browser. See
 * docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md.
 *
 * @returns Two predicates over competency and profession ids
 */
export function useGrantScope(): GrantScope {
  const { state } = useAuth();
  const user = state.status === "authenticated" ? state.user : null;
  const competencies = user?.may_grant;
  const professions = user?.may_assign_professions;
  return {
    mayGrant: (competency) =>
      competencies == null || competencies.includes(competency),
    mayAssignProfession: (profession) =>
      professions == null || professions.includes(profession),
  };
}
