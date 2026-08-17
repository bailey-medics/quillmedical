/**
 * swUpdateGate
 *
 * Gates service-worker update reloads on route safety (plan item 14 of
 * `docs/docs/plans/2026-08-09-alembic-review-and-revisions-plan.md`): a
 * waiting worker is only activated - and the page reloaded - when the
 * currently-rendered route explicitly opts in via `handle.safeForReload`,
 * the app is a production build, no flash message is in flight for the
 * current navigation, and this tab hasn't already reloaded once this
 * session (reload-loop guard).
 *
 * A route with no `handle.safeForReload` is unsafe by default (fail-safe).
 */

const RELOADED_ONCE_KEY = "quill-sw-update-reloaded";

export interface RouteHandle {
  safeForReload?: boolean;
}

export interface RouteMatchLike {
  handle?: RouteHandle;
}

/** True only if the deepest (leaf) matched route opts in via `handle.safeForReload`. */
export function isRouteSafeForReload(matches: RouteMatchLike[]): boolean {
  const leaf = matches[matches.length - 1];
  return leaf?.handle?.safeForReload === true;
}

export interface UpdateGateOptions {
  registration: ServiceWorkerRegistration;
  isProd: boolean;
  routeIsSafe: boolean;
  hasFlash: boolean;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

/**
 * Checks for a waiting service-worker update and, only if every safety
 * condition holds, tells it to activate. The existing `controllerchange`
 * listener performs the actual reload once activation completes.
 */
export async function checkForUpdateAndReloadIfSafe(
  options: UpdateGateOptions,
): Promise<void> {
  const { registration, isProd, routeIsSafe, hasFlash } = options;
  const storage = options.storage ?? sessionStorage;

  if (!isProd || !routeIsSafe || hasFlash) return;
  if (storage.getItem(RELOADED_ONCE_KEY)) return;

  try {
    await registration.update();
  } catch {
    // Fail closed - a failed check (network blip, offline) must never be
    // treated as a detected update.
    return;
  }

  const waiting = registration.waiting;
  if (!waiting) return;

  // Set before posting: activation triggers `controllerchange` -> reload
  // almost immediately, so this must already be recorded when the tab
  // reloads and this module re-initialises.
  storage.setItem(RELOADED_ONCE_KEY, "1");
  waiting.postMessage("SKIP_WAITING");
}
