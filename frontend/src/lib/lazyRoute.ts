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
 * `isRouteSafeForReload` reads it before the chunk has loaded, and reads
 * it off the leaf route. So a page with a guard of its own keeps its one
 * route, and passes the guard as the third argument:
 *
 * ```tsx
 * lazy: lazyFrom(loadAdmin, "EditSitePage", (Page) => (
 *   <RequireCompetency competency="manage_users">
 *     <Page />
 *   </RequireCompetency>
 * )),
 * ```
 *
 * Nesting the page under a guard route instead would make the page's
 * route the leaf, and a `handle` left on the guard would stop counting.
 */

import type { ComponentType, ReactElement } from "react";

/** The exports of a chunk module that are components needing no props. */
type PageExport<M> = {
  [K in keyof M]: M[K] extends ComponentType ? K : never;
}[keyof M];

/** The exports of a chunk module that are components, whatever they take. */
type ComponentExport<M> = {
  [K in keyof M]: M[K] extends ComponentType<never> ? K : never;
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
 *
 * With `render`, the route's component is whatever `render` returns for
 * the page: the page inside a guard, or given props. Without it the page
 * must need no props, since nothing would supply them.
 */
export function lazyFrom<M extends object>(
  load: () => Promise<M>,
  name: PageExport<M>,
): () => Promise<LazyRoute>;
export function lazyFrom<M extends object, K extends ComponentExport<M>>(
  load: () => Promise<M>,
  name: K,
  render: (Page: M[K]) => ReactElement,
): () => Promise<LazyRoute>;
export function lazyFrom<M extends object, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
  render?: (Page: M[K]) => ReactElement,
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

    const page = chunk[name];
    if (render === undefined) return { Component: page as ComponentType };

    // Defined once per route, when its chunk resolves, so React sees the
    // same component on every render and keeps the page's state.
    function Rendered(): ReactElement {
      return (render as (Page: M[K]) => ReactElement)(page);
    }
    return { Component: Rendered };
  };
}
