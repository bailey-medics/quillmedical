/**
 * lazyRoute
 *
 * Loads a page from a feature's one lazy chunk. Every route in a feature
 * passes the same loader, so the feature is a single `import()` target and
 * Rollup cuts a single chunk for it: one fetch on entering the feature and
 * none after. See
 * `docs/docs/plans/2026-10-04-lazy-load-one-chunk-per-feature-plan.md`.
 *
 * ```ts
 * { path: "users", lazy: lazyFrom(loadAdmin, "AdminUsersPage") }
 * ```
 *
 * `handle` stays on the route object, never in the chunk:
 * `isRouteSafeForReload` reads it before the chunk has loaded.
 */

import type { ComponentType } from "react";

/** The exports of a chunk module that are components, and so can be routed. */
type ComponentExport<M> = {
  [K in keyof M]: M[K] extends ComponentType ? K : never;
}[keyof M];

interface LazyRoute {
  Component: ComponentType;
}

function Nothing(): null {
  return null;
}

/**
 * Returns what React Router's `lazy` wants: a function resolving to the
 * route's `Component`. The name is checked against the chunk's exports, so
 * a misspelt page is a compile error and not a blank route.
 */
export function lazyFrom<M extends object>(
  load: () => Promise<M>,
  name: ComponentExport<M>,
): () => Promise<LazyRoute> {
  return async () => {
    // A failed `import()` normally rejects, and that rejection is left to
    // reach the router and its error boundary. The one exception: when the
    // preload recovery in swUpdateGate.ts decides to reload the page it
    // calls `preventDefault()` on `vite:preloadError`, and Vite then
    // resolves the import to undefined instead. The page is on its way
    // out, so render nothing for the moment that takes. Reading a page off
    // undefined here crashed with "Cannot read properties of undefined" on
    // 2026-09-24.
    const chunk: M | undefined = await load();
    if (chunk === undefined) return { Component: Nothing };

    return { Component: chunk[name] as ComponentType };
  };
}
