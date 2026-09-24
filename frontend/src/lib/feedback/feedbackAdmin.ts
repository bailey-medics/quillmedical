/**
 * Reading and closing feedback
 *
 * The operator's half of user feedback: every submission, and the status
 * each has reached. Operator-only on the server, because feedback comes from
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

/** Move a piece of feedback to another status. */
export function setFeedbackStatus(
  id: number,
  status: FeedbackStatus,
): Promise<FeedbackItem> {
  return api.patch<FeedbackItem>(`/feedback/${id}`, { status });
}
