/**
 * Keeps the reported route in step with the router.
 *
 * Mounted once, inside the router, so every navigation updates the pattern the
 * reporter reads. It renders nothing and returns nothing; the only thing it
 * does is write to the module in `currentRoute.ts`.
 */

import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { setCurrentRoute, toRoutePattern } from "./currentRoute";

export function useRouteTracking(): void {
  const { pathname } = useLocation();
  const params = useParams();

  useEffect(() => {
    setCurrentRoute(toRoutePattern(pathname, params));
  }, [pathname, params]);
}
