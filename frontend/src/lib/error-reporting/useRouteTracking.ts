/**
 * Keeps the reported route in step with the router.
 *
 * Mounted once, above every route tree, so every navigation updates the
 * pattern the reporter reads. It renders nothing and returns nothing; the only
 * thing it does is write to the module in `currentRoute.ts`.
 *
 * `useParams` reads the params of the deepest match, not of the route the
 * caller sits on, so it returns the full set even from the wrapper above every
 * tree. That is what lets this be declared in one place.
 *
 * It used to be called in `RootLayout`, which turned out to cover only part of
 * the application: `RootLayout` sits inside `RequireAuth`, so the sign-in and
 * registration pages, the 404, and the whole `/teaching` tree — a separate
 * top-level route with its own layout — recorded no route at all. Errors from
 * those screens reached Cloud Logging with no `httpRequest.url`, found by
 * reading real reports rather than by any test.
 *
 * The write happens **during render, not in an effect**. That is deliberate
 * and was learned from a real report: when a component throws while rendering,
 * React calls `componentDidCatch` in the commit phase, but passive effects run
 * after paint — so a report sent from a boundary went out before any effect
 * had recorded the route. The route was therefore missing on exactly the
 * failure the boundary exists for, while present on everything else. Setting
 * it during render means the value is in place before any child can throw.
 *
 * Writing to a module during render is not pure, and React would rather it did
 * not happen. It is tolerable here because the write is idempotent, guarded so
 * it only fires when the pattern actually changes, and touches nothing React
 * owns — no state, no context, nothing that could make a re-render observe a
 * different result.
 */

import { useLocation, useParams } from "react-router-dom";
import { recordRoute } from "./breadcrumbs";
import {
  getCurrentRoute,
  setCurrentRoute,
  toRoutePattern,
} from "./currentRoute";

export function useRouteTracking(): void {
  const { pathname } = useLocation();
  const params = useParams();

  const pattern = toRoutePattern(pathname, params);
  if (pattern !== getCurrentRoute()) {
    setCurrentRoute(pattern);
    recordRoute(pattern);
  }
}
