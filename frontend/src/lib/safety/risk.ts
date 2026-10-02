/**
 * The DCB0129 words for each point on the 5 by 5 risk matrix.
 *
 * Index by the score; index 0 is unused so a score reads directly.
 */

import type { RiskScore } from "./types";

export const LIKELIHOOD_WORDS: readonly string[] = [
  "",
  "very low",
  "low",
  "medium",
  "high",
  "very high",
];

export const SEVERITY_WORDS: readonly string[] = [
  "",
  "minor",
  "significant",
  "considerable",
  "major",
  "catastrophic",
];

/** The usual DCB0129 reading of a rating, 1 to 25. */
export function riskBand(
  rating: number,
): "acceptable" | "tolerable" | "undesirable" | "unacceptable" {
  if (rating <= 2) return "acceptable";
  if (rating <= 4) return "tolerable";
  if (rating <= 9) return "undesirable";
  return "unacceptable";
}

export function likelihoodWord(score: RiskScore): string {
  return LIKELIHOOD_WORDS[score];
}

export function severityWord(score: RiskScore): string {
  return SEVERITY_WORDS[score];
}
