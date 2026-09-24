/**
 * Sending user feedback
 *
 * The person types a message; everything else is captured here at the moment
 * they send it, the same way an error report captures it: the matched route
 * pattern, the breadcrumb trail, the release, the viewport and the user agent.
 *
 * Goes through the `api` client, not `sendBeacon` as error reports do. A crash
 * report has no answer worth waiting for; somebody who has just typed three
 * sentences needs to see that it arrived, or they will send it again or give
 * up. The sender is attributed by the server from the session cookie, never
 * from anything sent here.
 */

import { api } from "@/lib/api";
import { getBreadcrumbs } from "@/lib/error-reporting/breadcrumbs";
import { getCurrentRoute } from "@/lib/error-reporting/currentRoute";
import { readUserAgent, readViewport } from "@/lib/error-reporting/report";
import { sanitiseRelease, sanitiseRoute } from "@/lib/error-reporting/sanitise";

/** What the sender may say the feedback is about. Matches the server's set. */
export type FeedbackCategory = "broken" | "inaccurate" | "suggestion" | "other";

/** The labels shown for each category, in the order they are offered. */
export const FEEDBACK_CATEGORY_OPTIONS: ReadonlyArray<{
  value: FeedbackCategory;
  label: string;
}> = [
  { value: "broken", label: "Something is broken" },
  { value: "inaccurate", label: "Something is wrong or inaccurate" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Something else" },
];

/** What the person typed. */
export interface FeedbackInput {
  category: FeedbackCategory | null;
  message: string;
}

/** What the server accepts: snake_case, and a fixed set of keys. */
interface FeedbackWire {
  category: FeedbackCategory | null;
  message: string;
  route: string;
  release: string;
  viewport: string;
  user_agent: string;
  breadcrumbs: ReturnType<typeof getBreadcrumbs>;
}

/** The server's answer: the id of the feedback it stored. */
export interface FeedbackCreated {
  id: number;
}

/**
 * Build the request body, capturing the context at this moment.
 *
 * Exported for tests; application code calls `sendFeedback`.
 */
export function buildFeedbackBody(input: FeedbackInput): FeedbackWire {
  return {
    category: input.category,
    message: input.message.trim(),
    route: sanitiseRoute(getCurrentRoute()),
    release: sanitiseRelease(__APP_VERSION__),
    viewport: readViewport(),
    user_agent: readUserAgent(),
    breadcrumbs: getBreadcrumbs(),
  };
}

/**
 * Send feedback. Rejects if it did not arrive, so the caller can say so.
 */
export function sendFeedback(input: FeedbackInput): Promise<FeedbackCreated> {
  return api.post<FeedbackCreated>("/feedback", buildFeedbackBody(input));
}
