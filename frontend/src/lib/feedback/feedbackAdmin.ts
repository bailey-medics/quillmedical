/**
 * Reading and closing feedback
 *
 * The operator's half of user feedback: every submission, the status
 * each has reached, and the comment an operator wrote back. Operator-only on the server, because feedback comes from
 * every organisation and may contain patient data.
 */

import { api } from "@/lib/api";
import {
  FEEDBACK_CATEGORY_OPTIONS,
  type FeedbackCategory,
} from "./sendFeedback";

/** Where a piece of feedback has got to. Matches the server's set. */
export type FeedbackStatus = "new" | "acknowledged" | "resolved" | "wont_fix";

/** Every status, in the order an operator moves feedback through them. */
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "new",
  "acknowledged",
  "resolved",
  "wont_fix",
];

/** The label an operator sees for each status. */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

/** One piece of feedback, as an operator reads it. */
export interface FeedbackItem {
  id: number;
  status: FeedbackStatus;
  /** What an operator wrote back to the sender, or null if nothing yet */
  comment: string | null;
  category: FeedbackCategory | null;
  message: string;
  /** The sender's username, or null once they have been deleted */
  sender: string | null;
  route: string;
  release: string;
  viewport: string;
  user_agent: string;
  breadcrumbs: Record<string, unknown>[];
  error_name: string | null;
  error_code: string | null;
  created_at: string;
}

/** The label for a category, or a dash when none was chosen. */
export function categoryLabel(category: FeedbackCategory | null): string {
  return (
    FEEDBACK_CATEGORY_OPTIONS.find((option) => option.value === category)
      ?.label ?? "Not given"
  );
}

/** Every piece of feedback, newest first. */
export async function listFeedback(): Promise<FeedbackItem[]> {
  const res = await api.get<{ items: FeedbackItem[] }>("/feedback");
  return res.items;
}

/** One piece of feedback in full. */
export function getFeedback(id: number): Promise<FeedbackItem> {
  return api.get<FeedbackItem>(`/feedback/${id}`);
}

/** Longest comment the server accepts. Matches `MAX_COMMENT` there. */
export const MAX_FEEDBACK_COMMENT = 2000;

/** An operator's answer: a status, a comment or both. */
export interface FeedbackAnswer {
  status?: FeedbackStatus;
  /** A blank comment removes the one already there */
  comment?: string;
}

/**
 * Answer a piece of feedback in one request. Only what is named changes,
 * so a status sent alone leaves the comment as it was, and the other way
 * round.
 */
export function answerFeedback(
  id: number,
  answer: FeedbackAnswer,
): Promise<FeedbackItem> {
  return api.patch<FeedbackItem>(`/feedback/${id}`, answer);
}
