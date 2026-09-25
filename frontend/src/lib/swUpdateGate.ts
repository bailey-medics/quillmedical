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
  route?: { handle?: RouteHandle };
}

/** True only if the deepest (leaf) matched route opts in via `handle.safeForReload`. */
export function isRouteSafeForReload(matches: RouteMatchLike[]): boolean {
  const leaf = matches[matches.length - 1];
  return leaf?.route?.handle?.safeForReload === true;
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

export interface RouterLike {
  subscribe: (listener: () => void) => () => void;
  state: {
    matches: RouteMatchLike[];
    location: { state: unknown };
  };
}

/* ------------------------------------------------------------------ *
 * Lazy-chunk preload failures
 * ------------------------------------------------------------------ */

/**
 * Reload-loop guard for preload recovery. Deliberately *not* the same key
 * as the service-worker one above: the two reload for different reasons,
 * and sharing a key would let an SW reload silently suppress a preload
 * recovery (or the reverse), leaving a tab stuck on a dead navigation
 * with nothing to show for it.
 */
const PRELOAD_RELOADED_ONCE_KEY = "quill-preload-reloaded";

/**
 * How recently a recovery reload must have happened for another to count as
 * a loop. The guard holds the time of the last reload, not a flag: a flag
 * that was never cleared meant a tab could recover from one deploy and then
 * never again, and the next stale chunk crashed the page instead. A reload
 * that has not fixed things fails again within seconds; a new deploy hours
 * later is a new problem, and reloading is still the right answer to it.
 */
export const PRELOAD_RELOAD_LOOP_WINDOW_MS = 60 * 1000;

/**
 * What to do about a lazy chunk this tab could not fetch.
 *
 * - `reload` — the route is safe to reload, so fetch the current build and
 *   let the navigation complete against it.
 * - `defer` — reloading here would destroy work the user cannot get back,
 *   so leave the tab where it is. The navigation has already failed; the
 *   caller decides what to show.
 */
export type PreloadFailureAction = "reload" | "defer";

export interface PreloadFailureOptions {
  routeIsSafe: boolean;
  hasFlash: boolean;
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** Milliseconds since the epoch; injectable so tests can move time. */
  now?: () => number;
}

/**
 * Decides how to recover from `vite:preloadError`.
 *
 * A tab holds the bundle it downloaded until it reloads, and a long-lived
 * session can outlive the container that served it — rotating refresh
 * tokens mean it never re-logs-in. Once the router loads routes on demand,
 * that tab asks for a chunk hash the container stopped serving weeks ago
 * and the *navigation* throws. JavaScript is not in the precache manifest
 * (`globPatterns` in `vite.config.ts` covers logos and favicons only) and
 * there is no offline fallback page, so the failure is a dead page rather
 * than a slow one.
 *
 * The same route-safety rule as the service-worker gate applies, for the
 * same reason: a reload is only free when the route says it owns nothing
 * the user would lose. The difference is the fail-safe direction. The SW
 * gate defers because the tab is working and an update can wait; here the
 * navigation has *already* failed, so deferring is the worse outcome and
 * is reserved for when reloading would actively destroy something.
 */
export function decidePreloadFailureAction(
  options: PreloadFailureOptions,
): PreloadFailureAction {
  const { routeIsSafe, hasFlash } = options;
  const storage = options.storage ?? sessionStorage;
  const now = (options.now ?? Date.now)();

  // Failing again just after a reload means the reload is not fixing it (a
  // chunk missing from the *current* build, a broken deploy), and another
  // would spin. Outside the window it is a fresh stale chunk from a later
  // deploy, which a reload does fix.
  const lastReload = Number(storage.getItem(PRELOAD_RELOADED_ONCE_KEY));
  if (lastReload && now - lastReload < PRELOAD_RELOAD_LOOP_WINDOW_MS) {
    return "defer";
  }

  if (!routeIsSafe || hasFlash) return "defer";

  storage.setItem(PRELOAD_RELOADED_ONCE_KEY, String(now));
  return "reload";
}

export interface PreloadErrorWiring {
  router: RouterLike;
  /** Snapshots in-progress form input before a reload discards it. */
  persist: (pathname: string) => void;
  reload: () => void;
  /** Called instead of reloading when recovery is deferred. */
  onDeferred?: () => void;
  addEventListener?: typeof window.addEventListener;
  currentPathname?: () => string;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

/**
 * Listens for `vite:preloadError` and routes it through the route-safety
 * gate above.
 *
 * Vite fires this event on `window` when a dynamic import fails. Calling
 * `preventDefault()` stops Vite rethrowing, and it does more than that: the
 * failed `import()` then *resolves to undefined*. So it is called only when
 * this handler reloads the page. When it defers, the error is let through,
 * so the import rejects and the nearest `ErrorBoundary` shows its fallback
 * with a reload button. Suppressing it there handed `React.lazy` an
 * undefined module and crashed the page with "Cannot read properties of
 * undefined (reading 'default')" on 2026-09-24.
 *
 * Form state is persisted before reloading, reusing the same helper the
 * API-compatibility forced reload uses. That helper is best-effort and
 * covers native text inputs only, which is why it is a belt-and-braces
 * measure *behind* the route-safety check rather than a substitute for it.
 */
export function wirePreloadErrorRecovery(wiring: PreloadErrorWiring): void {
  const listen =
    wiring.addEventListener ?? window.addEventListener.bind(window);
  const pathname = wiring.currentPathname ?? (() => window.location.pathname);

  listen("vite:preloadError", (event: Event) => {
    const hasFlash = Boolean(
      (wiring.router.state.location.state as { flash?: unknown } | null)?.flash,
    );

    const action = decidePreloadFailureAction({
      routeIsSafe: isRouteSafeForReload(wiring.router.state.matches),
      hasFlash,
      storage: wiring.storage,
    });

    if (action === "defer") {
      // Not prevented: the import must reject, not resolve to undefined.
      wiring.onDeferred?.();
      return;
    }

    // Reloading, so ours to handle, and Vite must not also rethrow it.
    event.preventDefault();
    wiring.persist(pathname());
    wiring.reload();
  });
}

export const HOURLY_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Wires the three update-check triggers (navigation, hourly timer, initial
 * check on load) to the route-safety gate above. Extracted out of
 * `main.tsx` so the wiring itself - not just the pure gate function - is
 * covered by tests (see `swUpdateGate.test.ts`'s `wireUpdateChecks` suite).
 */
export function wireUpdateChecks(
  router: RouterLike,
  registration: ServiceWorkerRegistration,
  isProd: boolean,
  intervalMs: number = HOURLY_INTERVAL_MS,
): void {
  const runUpdateCheck = (hasFlash: boolean): void => {
    void checkForUpdateAndReloadIfSafe({
      registration,
      isProd,
      routeIsSafe: isRouteSafeForReload(router.state.matches),
      hasFlash,
    });
  };

  const currentHasFlash = (): boolean =>
    Boolean((router.state.location.state as { flash?: unknown } | null)?.flash);

  // Navigation trigger: re-checks every time the matched route changes.
  router.subscribe(() => runUpdateCheck(currentHasFlash()));

  // Hourly trigger: catches a tab that stays on one safe route without
  // navigating away.
  setInterval(() => runUpdateCheck(false), intervalMs);

  // Also check once on load, in case a build already shipped while this
  // tab was open before its first navigation.
  runUpdateCheck(currentHasFlash());
}

/** The parts of `navigator.serviceWorker` the reload wiring needs. */
export interface ServiceWorkerContainerLike {
  controller: unknown;
  addEventListener: (type: "controllerchange", listener: () => void) => void;
}

/**
 * Reload when a new service worker takes over, but not when the first one
 * does.
 *
 * On a first visit there is no controller yet; the worker installs and
 * claims the page a moment after it loads, which fires `controllerchange`
 * although nothing has been updated. Reloading then wiped whatever the
 * person had started typing, so a login form emptied itself under them
 * (the e2e tests caught it in WebKit, where it happens every time). An
 * update, when a controller was already in charge, still reloads, so the
 * page never runs old code against a new worker.
 */
export function wireControllerChangeReload(
  container: ServiceWorkerContainerLike,
  reload: () => void,
): void {
  let hadController = container.controller !== null;
  container.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    reload();
  });
}
