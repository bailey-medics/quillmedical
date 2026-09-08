/**
 * Counting which pages get used
 *
 * Answers "how many people visit each page of the app" and nothing else.
 * There is no funnel here, no retention curve, no per-person history — the
 * counts are of sessions, because that is what the question needs and it is
 * considerably cheaper to justify than counting identified people.
 *
 * What leaves the browser is the **matched route pattern** — `/patients/:id`,
 * never `/patients/abc123`, and never the document title. The pattern is
 * rebuilt from the router's own params by `toRoutePattern`, so an identifier
 * is removed because the router said it was one rather than because anything
 * recognised its shape.
 *
 * Sent with `sendBeacon` for the same reasons the error reporter uses it:
 * nothing here should be able to throw into a page somebody is using, there
 * is no answer worth waiting for, and a ping fired as the user navigates away
 * still arrives.
 */

import { getSessionId } from "@lib/error-reporting/report";

/** Where page views are posted. Same origin, so cookies travel with them. */
const ENDPOINT = "/api/analytics/page-views";

/**
 * Most pings one page load may send.
 *
 * The server allows a hundred and twenty a minute per address. Stopping short
 * of that keeps one tab from spending the whole allowance, which would
 * silence every other tab behind the same address.
 */
const MAX_VIEWS_PER_PAGE = 100;

let sent = 0;

/** The last pattern sent, so a re-render does not count twice. */
let lastSent = "";

/**
 * Record that a page was opened.
 *
 * Never throws, never returns a promise, and reports no failure of its own: a
 * ping that cannot be sent is dropped in silence, because a counting feature
 * must never interrupt somebody doing their work.
 */
export function recordPageView(pattern: string): void {
  try {
    if (!pattern || pattern === lastSent) return;
    if (sent >= MAX_VIEWS_PER_PAGE) return;
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return;

    const blob = new Blob(
      [JSON.stringify({ page: pattern, session_id: getSessionId() })],
      { type: "application/json" },
    );
    if (navigator.sendBeacon(ENDPOINT, blob)) {
      lastSent = pattern;
      sent += 1;
    }
  } catch (cause) {
    // Swallowed by design, and said aloud in development only — a catch this
    // broad hides ordinary mistakes as readily as genuine failures, which is
    // how the error reporter once sent nothing at all without saying so.
    if (import.meta.env.DEV) {
      console.warn("[page-views] ping dropped", cause);
    }
  }
}

/** Resets the per-page state. Exported for tests, not for application code. */
export function resetPageViewStateForTests(): void {
  sent = 0;
  lastSent = "";
}
