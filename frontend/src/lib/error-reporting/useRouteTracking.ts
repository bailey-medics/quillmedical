/**
 * Keeps the reported route in step with the router.
 *
 * Mounted once, inside the router, so every navigation updates the pattern the
 * reporter reads. It renders nothing and returns nothing; the only thing it
 * does is write to the module in `currentRoute.ts`.
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
