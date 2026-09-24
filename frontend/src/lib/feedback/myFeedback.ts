/**
 * Your own feedback
 *
 * What somebody has sent, and where each piece has got to. This is the
 * sender's half of the loop: without it a learner who reports a broken case
 * never finds out it was fixed, and stops reporting.
 */

import { api } from "@/lib/api";
import type { FeedbackStatus } from "./feedbackAdmin";
import type { FeedbackCategory } from "./sendFeedback";

/** Where the sender's feedback lives. */
export const YOUR_FEEDBACK_PATH = "/feedback";

/**
 * The label a sender sees for each status.
 *
 * Kept apart from the operator's labels on purpose. `acknowledged` means
 * something to the person triaging; to the person who sent it, what matters
 * is that somebody is looking at it.
 */
export const FEEDBACK_STATUS_SENDER_LABELS: Record<FeedbackStatus, string> = {
  new: "Received",
  acknowledged: "Being looked at",
  resolved: "Fixed",
  wont_fix: "Won't fix",
};

/** One piece of the sender's own feedback. */
export interface MyFeedbackItem {
  id: number;
  status: FeedbackStatus;
  category: FeedbackCategory | null;
  message: string;
  created_at: string;
}

/** The caller's own feedback, newest first. */
export async function listMyFeedback(): Promise<MyFeedbackItem[]> {
  const res = await api.get<{ items: MyFeedbackItem[] }>("/feedback/mine");
  return res.items;
}
