/**
 * prefetchFeatures
 *
 * Fetches, in the background, the lazy chunks of the features somebody can
 * open but has not opened yet, so the first click into each is instant.
 * See Phase 7 of
 * `docs/docs/plans/2026-10-04-lazy-load-one-chunk-per-feature-plan.md`.
 *
 * The rule over all of it: nothing here may disturb an exam in progress.
 * Three things each guarantee that on their own, so no single mistake can
 * break it:
 *
 * 1. Nothing is started unless every condition in `mayPrefetch` holds at
 *    the moment of starting, and one of them is that the route is safe to
 *    reload. The exam is not, so nothing starts during one.
 * 2. `isBackgroundFetchInFlight` lets the `vite:preloadError` recovery in
 *    `swUpdateGate.ts` tell a failed background fetch from a failed
 *    navigation, and ignore it. An `import()` cannot be cancelled, so one
 *    started on a safe route can still fail after the exam has begun.
 * 3. That recovery never reloads an unsafe route, whatever asked for the
 *    chunk.
 */

/** One feature's lazy chunk, and who may open the feature. */
export interface PrefetchChunk<U> {
  name: string;
  load: () => Promise<unknown>;
  canOpen: (user: U) => boolean;
}

/** Everything that must be true, at the moment a fetch starts. */
export interface PrefetchConditions {
  signedIn: boolean;
  /** The current route is `safeForReload`. The exam is not. */
  routeIsSafe: boolean;
  /** The router is not part-way through a navigation. */
  navigationIdle: boolean;
  online: boolean;
  /** The browser reports data saver or a 2G connection. */
  constrained: boolean;
}

export function mayPrefetch(conditions: PrefetchConditions): boolean {
  return (
    conditions.signedIn &&
    conditions.routeIsSafe &&
    conditions.navigationIdle &&
    conditions.online &&
    !conditions.constrained
  );
}

/** `navigator.connection`, where the browser has one. Safari does not. */
interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

interface NavigatorLike {
  onLine?: boolean;
  connection?: ConnectionLike;
}

const SLOW_CONNECTIONS = ["slow-2g", "2g"];

/** What the browser says about the network, defaulting to "fine". */
export function readConnection(
  nav: NavigatorLike = navigator as NavigatorLike,
): Pick<PrefetchConditions, "online" | "constrained"> {
  const connection = nav.connection;
  return {
    online: nav.onLine !== false,
    constrained:
      connection?.saveData === true ||
      SLOW_CONNECTIONS.includes(connection?.effectiveType ?? ""),
  };
}

let inFlight = 0;
const attempted = new Set<string>();

/**
 * True while a background fetch is under way. Read by the
 * `vite:preloadError` recovery, which must not reload the page because a
 * fetch nobody asked for has failed.
 */
export function isBackgroundFetchInFlight(): boolean {
  return inFlight > 0;
}

export type PrefetchOutcome =
  /** A chunk was fetched; there may be more. */
  | "fetched"
  /** A chunk failed. It is not tried again; a click will fetch it. */
  | "failed"
  /** There is a chunk to fetch, but now is not the moment. */
  | "blocked"
  /** Every chunk this person can open has been tried. */
  | "nothing-left";

/**
 * Fetches the next chunk this person can open, if `mayStart` says so.
 *
 * One chunk per call, so the caller re-checks every condition before the
 * next. Each chunk is tried once per page load: a failure is left for an
 * ordinary navigation to retry, where the recovery handler can act on it.
 * Never throws.
 */
export async function prefetchNextFeature<U>(
  chunks: readonly PrefetchChunk<U>[],
  user: U,
  mayStart: () => boolean,
): Promise<PrefetchOutcome> {
  const next = chunks.find(
    (chunk) => !attempted.has(chunk.name) && chunk.canOpen(user),
  );
  if (next === undefined) return "nothing-left";
  if (!mayStart()) return "blocked";

  attempted.add(next.name);
  inFlight += 1;
  try {
    await next.load();
    return "fetched";
  } catch {
    // Said nowhere: nobody asked for this, so nobody is told it failed.
    return "failed";
  } finally {
    inFlight -= 1;
  }
}

/** How long to wait for the browser to be idle before going ahead anyway. */
const IDLE_TIMEOUT_MS = 5000;
/** The wait where `requestIdleCallback` does not exist, as in Safari. */
const FALLBACK_DELAY_MS = 2000;

interface IdleWindow {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
}

/** Runs `callback` when the browser is idle. Returns a function to cancel. */
export function whenIdle(
  callback: () => void,
  win: IdleWindow = window as unknown as IdleWindow,
): () => void {
  if (win.requestIdleCallback && win.cancelIdleCallback) {
    const handle = win.requestIdleCallback(callback, {
      timeout: IDLE_TIMEOUT_MS,
    });
    return () => win.cancelIdleCallback?.(handle);
  }
  const handle = win.setTimeout(callback, FALLBACK_DELAY_MS);
  return () => win.clearTimeout(handle);
}

export function resetPrefetchStateForTests(): void {
  inFlight = 0;
  attempted.clear();
}
