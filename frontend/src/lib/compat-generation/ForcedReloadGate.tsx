/**
 * ForcedReloadGate
 *
 * Root-mounted, presentational piece of the API-compatibility
 * forced-reload flow (see
 * docs/docs/plans/2026-08-09-sub-plan-api-compatibility-plan.md). All
 * side effects (event listening, retry timers, form-state persistence)
 * live in `ForcedReloadProvider`/`useForcedReload` — this component only
 * renders the full-screen blocking overlay while `phase === "blocking"`.
 *
 * Mounted once, near the app root, sibling to `RouterProvider`, so it
 * applies regardless of which layout (or no layout, e.g. guest pages) is
 * currently active. The complementary *fallback* status strip is
 * rendered by `MainLayout`/`TeachingLayout` themselves via
 * `useForcedReload()`, stacked below their own `TopRibbon`.
 */

import UpdatingBanner from "@/components/updating-banner/UpdatingBanner";
import { useForcedReload } from "./ForcedReloadProvider";

export default function ForcedReloadGate() {
  const { phase } = useForcedReload();

  if (phase === "blocking") {
    return <UpdatingBanner />;
  }

  return null;
}
