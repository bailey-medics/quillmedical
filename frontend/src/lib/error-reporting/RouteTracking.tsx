/**
 * The route-tracking wrapper route.
 *
 * A pathless route sitting above every tree in the router, so that recording
 * which screen is showing happens in one place rather than once per layout.
 * It renders nothing of its own — only the matched route beneath it.
 *
 * The alternative was calling `useRouteTracking` in each layout, which is how
 * the defect this closes came about: it was called in `RootLayout` alone, and
 * `RootLayout` covers neither the sign-in pages nor the `/teaching` tree, so
 * errors on those screens were reported with no route. A layout added later
 * would have had the same gap, and nothing would have said so. Declared once
 * at the root, a new tree inherits it instead.
 */

import { Outlet } from "react-router-dom";
import { useRouteTracking } from "./useRouteTracking";

export default function RouteTracking() {
  useRouteTracking();
  return <Outlet />;
}
