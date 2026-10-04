/**
 * prefetchFeatures
 *
 * Fetches, in the background, the files of the features somebody can open
 * but has not opened yet, so the first click into each needs no download.
 * See Phases 7 and 9 of
 * `docs/docs/plans/2026-10-04-lazy-load-one-chunk-per-feature-plan.md`.
 *
 * The files are fetched with `fetch()`, into the browser's HTTP cache.
 * Nothing is imported. That is deliberate, and it is the second attempt:
 * the first called each feature's `import()`, and a failed `import()` is
 * remembered by the browser for the life of the page. One background
 * failure then made the later click fail too, however good the connection
 * was by then. A failed `fetch()` leaves nothing behind, so the click
 * imports the file as if nothing had been tried. A successful one leaves
 * the file in the cache, where the click's `import()` finds it.
 *
 * The file names carry a hash that only the build knows, so they are read
 * from the manifest the build writes (`build.manifest` in vite.config.ts).
 *
 * The rule over all of it: nothing here may disturb an exam in progress.
 *
 * 1. Nothing is started unless every condition in `mayPrefetch` holds at
 *    the moment of starting, and one of them is that the route is safe to
 *    reload. The exam is not, so nothing starts during one.
 * 2. A `fetch()` that fails cannot fire `vite:preloadError`, so it can
 *    never reach the recovery in `swUpdateGate.ts` that reloads the page.
 * 3. That recovery never reloads an unsafe route in any case.
 */

/** One feature's lazy chunk, and who may open the feature. */
export interface PrefetchChunk<U> {
  name: string;
  /**
   * The chunk module's path from the frontend root, which is its key in
   * the build manifest: `src/pages/admin/adminChunk.ts`.
   */
  source: string;
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

/* ------------------------------------------------------------------ *
 * The build manifest
 * ------------------------------------------------------------------ */

/** Where the production build writes its manifest. */
export const MANIFEST_ADDRESS = "/.vite/manifest.json";

/** One entry of Vite's build manifest, as far as this module reads it. */
interface ManifestEntry {
  file: string;
  /** Keys of other entries this one imports. */
  imports?: string[];
  css?: string[];
}

export type BuildManifest = Record<string, ManifestEntry>;

function isManifestEntry(value: unknown): value is ManifestEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "file" in value &&
    typeof value.file === "string"
  );
}

/**
 * Every file a chunk needs: its own, its stylesheets, and those of
 * everything it imports, however deep. As addresses, without repeats.
 * Empty if the manifest does not know the chunk.
 */
export function filesFor(manifest: BuildManifest, source: string): string[] {
  const files = new Set<string>();
  const seen = new Set<string>();

  const collect = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);

    const entry = manifest[key];
    if (!isManifestEntry(entry)) return;

    files.add(`/${entry.file}`);
    (entry.css ?? []).forEach((stylesheet) => files.add(`/${stylesheet}`));
    (entry.imports ?? []).forEach(collect);
  };
  collect(source);

  return [...files];
}

/** The parts of the browser this module uses, so tests can stand in. */
export interface PrefetchIo {
  fetch: (address: string, init?: RequestInit) => Promise<Response>;
}

const browserIo: PrefetchIo = {
  // Not the `api` client: these are the app's own static files, not
  // backend calls, and they need neither CSRF nor a retry on 401.
  fetch: (address, init) => fetch(address, init),
};

/**
 * Reads the build manifest, or returns null if there is none to read.
 *
 * There is none in development: the dev server answers with `index.html`,
 * which is not JSON. That is right, since nothing is chunked there.
 * Asked for with `no-cache` so a new build's manifest is seen.
 */
export async function readManifest(
  io: PrefetchIo = browserIo,
): Promise<BuildManifest | null> {
  try {
    const response = await io.fetch(MANIFEST_ADDRESS, { cache: "no-cache" });
    if (!response.ok) return null;

    const manifest: unknown = await response.json();
    if (typeof manifest !== "object" || manifest === null) return null;
    return manifest as BuildManifest;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

const attempted = new Set<string>();
let manifestRead: Promise<BuildManifest | null> | undefined;

export type PrefetchOutcome =
  /** A feature's files were fetched; there may be more features. */
  | "fetched"
  /** A feature's files could not all be fetched. A click will fetch them. */
  | "failed"
  /** There is a feature to fetch, but now is not the moment. */
  | "blocked"
  /** Every feature this person can open has been tried, or none can be. */
  | "nothing-left";

async function fetchIntoCache(io: PrefetchIo, address: string): Promise<void> {
  // `low`, where the browser understands it, so this never competes with
  // what the page itself is asking for.
  const response = await io.fetch(address, { priority: "low" });
  if (!response.ok) throw new Error(`${response.status} for ${address}`);
}

/**
 * Fetches the files of the next feature this person can open, if
 * `mayStart` says so.
 *
 * One feature per call, so the caller re-checks every condition before
 * the next. Each feature is tried once per page load: a failure is left
 * for the click itself to fetch. Never throws.
 */
export async function prefetchNextFeature<U>(
  chunks: readonly PrefetchChunk<U>[],
  user: U,
  mayStart: () => boolean,
  io: PrefetchIo = browserIo,
): Promise<PrefetchOutcome> {
  const next = chunks.find(
    (chunk) => !attempted.has(chunk.name) && chunk.canOpen(user),
  );
  if (next === undefined) return "nothing-left";
  if (!mayStart()) return "blocked";

  manifestRead ??= readManifest(io);
  const manifest = await manifestRead;
  if (manifest === null) return "nothing-left";

  // Reading the manifest took time, and an exam may have started in it.
  if (!mayStart()) return "blocked";

  attempted.add(next.name);
  const files = filesFor(manifest, next.source);
  if (files.length === 0) return "failed";

  try {
    await Promise.all(files.map((file) => fetchIntoCache(io, file)));
    return "fetched";
  } catch {
    // Said nowhere: nobody asked for this, so nobody is told it failed.
    return "failed";
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
  attempted.clear();
  manifestRead = undefined;
}
