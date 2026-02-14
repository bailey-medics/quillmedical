// frontend/src/lib/cbac/hooks.ts
/**
 * CBAC Permission Hooks
 *
 * React hooks for checking user competencies in components.
 * Integrates with AuthContext and provides simple boolean checks.
 */

import { useAuth } from "../../contexts/AuthContext";
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

  // If user data includes competencies (from JWT), check them
  // Otherwise, assume false (no competency)
  if (!state.user) return false;

  // Note: In the current implementation, competencies are in the JWT
  // but AuthContext may not expose them. This hook demonstrates the pattern.
  // In production, you would fetch competencies from /api/cbac/my-competencies
  // or extract them from the decoded JWT token.

  // For now, return false as a safe default
  // TODO: Implement actual competency check once AuthContext exposes competencies
  // The competency parameter will be used like: state.user.competencies?.includes(competency)
  console.debug(`Checking competency: ${competency}`);
  return false;
}

/**
 * Check if user has ANY of the specified competencies
 *
 * @param competencies - List of competency IDs (user needs at least one)
 * @returns true if user has at least one competency
 *
 * Note: This is a placeholder implementation. React hooks rules prevent
 * calling hooks conditionally or in loops. For now, returns false.
 * TODO: Redesign to fetch all user competencies once and check membership
 */
export function useHasAnyCompetency(...competencies: CompetencyId[]): boolean {
  const { state } = useAuth();

  // TODO: Check if any competency is in state.user.competencies
  // This requires AuthContext to expose competencies array
  console.debug("Checking competencies:", competencies);
  return !state.user && competencies.length > 0 ? false : false;
}

/**
 * Check if user has ALL of the specified competencies
 *
 * @param competencies - List of competency IDs (user needs all)
 * @returns true if user has all competencies
 *
 * Note: This is a placeholder implementation. React hooks rules prevent
 * calling hooks conditionally or in loops. For now, returns false.
 * TODO: Redesign to fetch all user competencies once and check membership
 */
export function useHasAllCompetencies(
  ...competencies: CompetencyId[]
): boolean {
  const { state } = useAuth();

  // TODO: Check if all competencies are in state.user.competencies
  // This requires AuthContext to expose competencies array
  console.debug("Checking competencies:", competencies);
  return !state.user && competencies.length > 0 ? false : false;
}
