/**
 * Sending client error reports
 *
 * The one path out of the browser for error reports. Everything here is built
 * around a single constraint: reporting an error must not be able to cause
 * one. A failure on this path arrives when the application is already broken,
 * so anything that throws, retries or blocks turns one fault into a loop.
 *
 * That is why this uses `navigator.sendBeacon` rather than the shared `api`
 * client, which is otherwise the rule for talking to the backend. `sendBeacon`
 * is fire-and-forget: it cannot reject, it has no retry behaviour to inherit,
 * it does not fire the connectivity events the client dispatches, and the
 * browser keeps the request alive after the page goes away — so an error
 * thrown while the user is navigating off a broken page still arrives. The
 * `api` client is right for calls whose answer matters; here there is no
 * answer worth having.
 */

import { type Breadcrumb, getBreadcrumbs } from "./breadcrumbs";
import { getCurrentRoute } from "./currentRoute";
import {
  type ErrorSource,
  fromError,
  sanitiseErrorReport,
  sanitiseRoute,
} from "./sanitise";

/** Where reports are posted. Same origin, so cookies travel with them. */
const ENDPOINT = "/api/analytics/client-errors";

/**
 * Most reports one page load may send.
 *
 * The server allows thirty a minute per address; stopping short of that keeps
 * a render loop in one tab from spending the whole allowance, which would
 * silence every other tab behind the same address.
 */
const MAX_REPORTS_PER_PAGE = 20;

/** Longest user agent string sent, matching the server's own bound. */
const MAX_USER_AGENT = 300;

/**
 * Identifies this page load, and nothing else.
 *
 * Held in a module variable and never written to `sessionStorage`, a cookie or
 * anywhere else on the device. That is a deliberate constraint rather than an
 * oversight: storing it would be storage on the user's device, which engages
 * the Privacy and Electronic Communications Regulations, and error reporting
 * is not plausibly "strictly necessary" — so it would need a consent banner.
 * A refresh therefore starts a new identifier, which is the accepted cost.
 *
 * It groups a cascade of errors into one visit without saying whose. On a
 * signed-in page the server attaches the real user itself, from the session
 * cookie; it never trusts anything sent from here for that.
 */
const SESSION_ID: string = makeSessionId();

/** Signatures already reported, so a repeating fault is sent once. */
const seen = new Set<string>();

let sent = 0;

function makeSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the arithmetic version below.
  }
  // Only needs to be distinct within a moment, not hard to guess: it identifies
  // a page load for grouping and grants no access to anything.
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The viewport, as `390x844`, or empty when it cannot be read sensibly.
 *
 * The server constrains this to two short runs of digits, so anything odd —
 * a zero-sized window during teardown, a fractional value under zoom — is
 * dropped rather than sent in a shape that would be rejected.
 */
function readViewport(): string {
  try {
    const w = Math.round(window.innerWidth);
    const h = Math.round(window.innerHeight);
    const usable = (n: number): boolean =>
      Number.isFinite(n) && n > 0 && n < 100000;
    return usable(w) && usable(h) ? `${w}x${h}` : "";
  } catch {
    return "";
  }
}

/** What the server accepts, which is snake_case and a fixed set of keys. */
type WireReport = {
  name: string;
  message: string;
  stack: string;
  component_stack: string;
  error_code: string;
  status?: number;
  route: string;
  release: string;
  source: ErrorSource;
  session_id: string;
  user_agent: string;
  viewport: string;
  breadcrumbs: Breadcrumb[];
};

/** Extra context the caller can supply, none of it required. */
export type ReportOptions = {
  /** React's component stack, which only an error boundary has. */
  componentStack?: string | undefined;
  /**
   * The matched route pattern — `/patients/:id` — never a resolved URL.
   *
   * Defaults to whatever the router last recorded, which is what the error
   * boundary and the window listeners rely on: neither can be handed one.
   */
  route?: string | undefined;
};

/**
 * Report an error, if it is worth reporting and the browser can send it.
 *
 * Never throws, never returns a promise, and never reports a failure of its
 * own: a report that cannot be sent is dropped in silence, because the only
 * thing worse than losing one is looping on it.
 */
export function reportError(
  error: unknown,
  source: ErrorSource,
  options: ReportOptions = {},
): void {
  try {
    if (sent >= MAX_REPORTS_PER_PAGE) return;
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return;

    const report = sanitiseErrorReport(
      fromError(error, __APP_VERSION__, source, options.componentStack),
    );

    // A repeating fault says nothing new after the first report, and a render
    // loop can raise the same one many times a second.
    const signature = [
      report.name,
      report.message,
      report.stack.split("\n")[0] ?? "",
    ].join("|");
    if (seen.has(signature)) return;
    seen.add(signature);

    const wire: WireReport = {
      name: report.name,
      message: report.message,
      stack: report.stack,
      component_stack: report.componentStack,
      error_code: report.errorCode,
      route: sanitiseRoute(options.route ?? getCurrentRoute()),
      release: report.release,
      source: report.source,
      session_id: SESSION_ID,
      user_agent: readUserAgent(),
      viewport: readViewport(),
      breadcrumbs: getBreadcrumbs(),
    };
    if (report.status !== undefined) wire.status = report.status;

    const blob = new Blob([JSON.stringify(wire)], {
      type: "application/json",
    });
    if (navigator.sendBeacon(ENDPOINT, blob)) sent += 1;
  } catch (cause) {
    // Swallowed by design: throwing here would raise an error inside whatever
    // was already failing, which is the loop this whole module exists to
    // avoid. Said aloud in development only, because a catch this broad hides
    // ordinary mistakes as readily as it absorbs genuine failures — a missing
    // build constant left this silently sending nothing at all, and the
    // silence was the hard part to notice.
    if (import.meta.env.DEV) {
      console.warn("[error-reporting] report dropped", cause);
    }
  }
}

function readUserAgent(): string {
  try {
    return (navigator.userAgent ?? "").slice(0, MAX_USER_AGENT);
  } catch {
    return "";
  }
}

/** Resets the per-page state. Exported for tests, not for application code. */
export function resetReportingStateForTests(): void {
  seen.clear();
  sent = 0;
}
