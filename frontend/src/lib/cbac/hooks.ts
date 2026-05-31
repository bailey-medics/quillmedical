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
