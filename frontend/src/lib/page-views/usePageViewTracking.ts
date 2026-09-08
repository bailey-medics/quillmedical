/**
 * Sends a page view when the route changes.
 *
 * Mounted once, inside the router. Three things must be true before anything
 * is sent, checked in this order:
 *
 * 1. The route is not clinical. A route opts *in* to being counted by not
 *    declaring `handle.clinical`, so a new clinical route added without
 *    thought is counted — which is why the guard is on the subtree root
 *    rather than on each leaf, and why the test names that route.
 * 2. The user has not opted out.
 * 3. There is a matched pattern to send.
 *
 * Unlike the error reporter's route tracking, this runs in an effect. That is
 * correct here: a page view is a thing that happened, and if the render
 * crashes before the effect runs then the page was never really shown.
 */

import { useEffect } from "react";
import { useLocation, useMatches, useParams } from "react-router-dom";
import { toRoutePattern } from "@lib/error-reporting/currentRoute";
import { hasOptedOut } from "./optOut";
import { recordPageView } from "./pageViews";

/** What a route may declare about itself. */
type ClinicalHandle = { clinical?: boolean };

export function usePageViewTracking(): void {
  const { pathname } = useLocation();
  const params = useParams();
  const matches = useMatches();

  const isClinical = matches.some(
    (m) => (m.handle as ClinicalHandle | undefined)?.clinical === true,
  );

  useEffect(() => {
    if (isClinical) return;
    if (hasOptedOut()) return;
    recordPageView(toRoutePattern(pathname, params));
  }, [pathname, params, isClinical]);
}
