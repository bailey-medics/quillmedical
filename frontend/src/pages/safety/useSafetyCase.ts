/**
 * The safety case named in the address, read from the fixtures.
 *
 * Shared by the case page and its six card pages so each resolves the
 * `:caseId` segment the same way. Returns undefined for an address nobody
 * has, which every page answers with a 404. Part of the safety mock-up;
 * see docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { useParams } from "react-router-dom";
import { safetyCaseById, type SafetyCaseDetail } from "@lib/safety";

export function useSafetyCase(): SafetyCaseDetail | undefined {
  const { caseId } = useParams<{ caseId: string }>();
  if (!caseId) return undefined;
  return safetyCaseById(caseId);
}
