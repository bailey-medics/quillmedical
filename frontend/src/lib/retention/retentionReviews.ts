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
 * One closed account, awaiting a decision to empty it. It comes up once
 * no training records are left on it, so it is at no organisation and
 * has nothing to count.
 */
export interface RetentionAccount {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  /** When the account was closed */
  closed_at: string;
  /** When it had been kept as long as an account is */
  due_on: string;
  /** When the nightly run first listed it */
  listed_at: string;
}

/**
 * Why the nightly run did not empty an account marked to be emptied.
 * `failed` is tried again each night; the other two are accounts in use,
 * left alone.
 */
export type NotEmptiedReason = "failed" | "opened_again" | "has_records";

/** An account marked to be emptied that the nightly run did not empty */
export interface RetentionException {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  /** When the account was closed */
  closed_at: string;
  /** When it had been kept as long as an account is */
  due_on: string;
  reason: NotEmptiedReason;
  /** For a failure, what went wrong, naming nobody */
  detail: string | null;
  /** When the run last did not empty it */
  noted_at: string;
}

/** What happened, in words for the person reading the screen. */
export function whatHappened(exception: RetentionException): string {
  switch (exception.reason) {
    case "failed":
      return `Could not be emptied: ${exception.detail ?? "something went wrong while emptying it."} Tried again each night.`;
    case "opened_again":
      return "Left alone: the account was opened again.";
    case "has_records":
      return "Left alone: it has training records again.";
  }
}

/** Everything awaiting a decision, and what did not go as decided */
export interface RetentionWaiting {
  reviews: RetentionReview[];
  accounts: RetentionAccount[];
  exceptions: RetentionException[];
}

/**
 * Whether a card is about records somewhere, not the account itself.
 * Asked this way round because records have every field an account
 * has, so only "is it records?" tells the two apart for the compiler.
 */
export function isRecords(
  item: RetentionReview | RetentionAccount,
): item is RetentionReview {
  return "organisation" in item;
}

/**
 * What the person deciding has chosen for one row. `undecided` is where
 * every row starts, and a row left there is not sent.
 */
export type RetentionChoice = "undecided" | "delete" | "keep";

/** The most characters a note may hold, as the API enforces */
export const MAX_RETENTION_NOTE = 2000;

/** Delete the records, or mark the account to be emptied */
export interface RetentionDeleteDecision {
  review_id: number;
  decision: "delete";
  note?: string;
}

/**
 * Keep them. Always with why, and always with the date to ask again:
 * the API refuses a keep with no date, so that "keep" cannot come to
 * mean "keep for ever".
 */
export interface RetentionKeepDecision {
  review_id: number;
  decision: "keep";
  note: string;
  /** When to ask again, as an ISO date and time */
  ask_again_on: string;
}

/** One decision to carry out */
export type RetentionDecision = RetentionDeleteDecision | RetentionKeepDecision;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Tomorrow, as YYYY-MM-DD: the earliest a keep may ask again. */
export function tomorrow(today: Date = new Date()): string {
  const next = new Date(today);
  next.setDate(next.getDate() + 1);

  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
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
  /** Accounts marked to be emptied by the nightly run */
  to_empty: number;
  refused: RetentionRefusal[];
}

export async function listRetentionReviews(): Promise<RetentionWaiting> {
  const res = await api.get<{
    reviews: RetentionReview[];
    accounts?: RetentionAccount[];
    exceptions?: RetentionException[];
  }>("/retention/reviews");

  // A server from before these lists were added sends neither.
  return {
    reviews: res.reviews,
    accounts: res.accounts ?? [],
    exceptions: res.exceptions ?? [],
  };
}

export function sendRetentionDecisions(
  decisions: RetentionDecision[],
): Promise<RetentionOutcome> {
  return api.post<RetentionOutcome>("/retention/decisions", { decisions });
}
