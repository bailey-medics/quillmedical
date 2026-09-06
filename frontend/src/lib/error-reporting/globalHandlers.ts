/**
 * Reporting errors React never sees
 *
 * An error boundary only catches what is thrown while React renders. It never
 * sees a rejected promise, an error thrown from a timer or an event listener,
 * or anything raised before the tree mounts — which in an application built on
 * API calls is most of what goes wrong. These two listeners cover that gap.
 *
 * Both are deliberately quiet. They do not preventDefault, so the browser
 * still logs to the console as it would have; the aim is to hear about the
 * failure, not to change what happens because of it.
 */

import { reportError } from "./report";

/** Installed once. A second call would double-report every error. */
let installed = false;

/**
 * Whether an `error` event describes a script failure rather than a resource
 * that failed to load.
 *
 * `window.onerror` fires for a broken image or a stylesheet that 404s as well
 * as for a thrown error, and those arrive with no `error` object and a target
 * that is an element. Reporting them would fill the logs with things no
 * developer can act on from a stack trace.
 */
function isScriptError(event: ErrorEvent): boolean {
  return event.error !== undefined && event.error !== null;
}

/**
 * Start reporting unhandled rejections and errors outside React's tree.
 *
 * Safe to call more than once; only the first call takes effect. Returns a
 * function that removes the listeners again, which is what tests use — nothing
 * in the application needs to stop reporting.
 */
export function installGlobalErrorReporting(): () => void {
  if (installed) return () => {};
  installed = true;

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    reportError(event.reason, "unhandledrejection");
  };

  const onError = (event: ErrorEvent): void => {
    if (!isScriptError(event)) return;
    reportError(event.error, "window");
  };

  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("error", onError);

  return () => {
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("error", onError);
    installed = false;
  };
}
