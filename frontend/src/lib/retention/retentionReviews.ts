/**
 * Records awaiting a decision
 *
 * The nightly retention run lists a closed account's training records
 * once their sponsor's period has passed, and deletes none of them. An
 * operator decides, for each: delete, keep, or leave for later. This is
 * the API for that screen.
 */

import { api } from "@/lib/api";

/** One person's records at one organisation, awaiting a decision */
export interface RetentionReview {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  org_unit_id: number;
  organisation: string;
  /** When their account was closed */
  closed_at: string;
  /** When that organisation's period for them ended */
  due_on: string;
  /** Attempts a decision to delete would remove */
  attempts: number;
  /** Enrolments it would remove */
  enrolments: number;
  /** When the nightly run first listed them */
  listed_at: string;
}

/**
 * What the person deciding has chosen for one row. `undecided` is where
 * every row starts, and a row left there is not sent.
 */
export type RetentionChoice = "undecided" | "delete" | "keep";

/** The most characters a note may hold, as the API enforces */
export const MAX_RETENTION_NOTE = 2000;

/** One decision to carry out */
export interface RetentionDecision {
  review_id: number;
  decision: "delete" | "keep";
  note?: string;
}

/** A decision that was not carried out, and why */
export interface RetentionRefusal {
  review_id: number;
  reason: string;
}

/** What was done */
export interface RetentionOutcome {
  deleted: number;
  kept: number;
  refused: RetentionRefusal[];
}

export async function listRetentionReviews(): Promise<RetentionReview[]> {
  const res = await api.get<{ reviews: RetentionReview[] }>(
    "/retention/reviews",
  );

  return res.reviews;
}

export function sendRetentionDecisions(
  decisions: RetentionDecision[],
): Promise<RetentionOutcome> {
  return api.post<RetentionOutcome>("/retention/decisions", { decisions });
}
