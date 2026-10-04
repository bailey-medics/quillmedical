/**
 * FeaturePrefetch
 *
 * Renders nothing. While somebody is signed in, on a page that is safe to
 * reload, with the router and the browser both idle, it fetches the lazy
 * chunks of the other features they can open, one at a time. The rules
 * and the reasons are in `prefetchFeatures.ts`.
 *
 * Mounted once, on the root route in `main.tsx`, so it covers every tree,
 * `/teaching` included.
 *
 * It starts nothing during an exam. The effect below runs only on a route
 * that is `safeForReload`, and the exam is not. Arriving at the exam
 * re-runs the effect, whose clean-up cancels anything still waiting for an
 * idle moment. A fetch already in flight cannot be cancelled; if it then
 * fails, the recovery handler in `swUpdateGate.ts` ignores it.
 */

import { useEffect } from "react";
import { useMatches, useNavigation } from "react-router-dom";
import { useAuth, type User } from "@/auth/AuthContext";
import { FEATURE_CHUNKS } from "@/featureChunks";
import {
  mayPrefetch,
  prefetchNextFeature,
  readConnection,
  whenIdle,
  type PrefetchChunk,
} from "./prefetchFeatures";

/** The leaf route's `handle.safeForReload`, as `isRouteSafeForReload` reads it. */
function leafIsSafeForReload(matches: readonly { handle: unknown }[]): boolean {
  const handle = matches[matches.length - 1]?.handle;
  return (
    typeof handle === "object" &&
    handle !== null &&
    "safeForReload" in handle &&
    handle.safeForReload === true
  );
}

interface FeaturePrefetchProps {
  /** The chunks to fetch. Defaults to every feature; tests pass their own. */
  chunks?: readonly PrefetchChunk<User>[];
  /** Schedules work for an idle moment. Tests pass their own. */
  schedule?: (callback: () => void) => () => void;
}

export default function FeaturePrefetch({
  chunks = FEATURE_CHUNKS,
  schedule = whenIdle,
}: FeaturePrefetchProps) {
  const { state } = useAuth();
  const matches = useMatches();
  const navigation = useNavigation();

  const user = state.status === "authenticated" ? state.user : null;
  const routeIsSafe = leafIsSafeForReload(matches);
  const navigationIdle = navigation.state === "idle";

  useEffect(() => {
    if (user === null || !routeIsSafe || !navigationIdle) return;

    let cancelled = false;
    let cancelScheduled = (): void => {};

    // Checked again when the idle moment comes, not only when it was
    // asked for: `cancelled` is set the instant the route, the navigation
    // or the session changes.
    const mayStart = (): boolean =>
      !cancelled &&
      mayPrefetch({
        signedIn: true,
        routeIsSafe,
        navigationIdle,
        ...readConnection(),
      });

    const fetchNext = (): void => {
      cancelScheduled = schedule(() => {
        void prefetchNextFeature(chunks, user, mayStart).then((outcome) => {
          const more = outcome === "fetched" || outcome === "failed";
          if (more && !cancelled) fetchNext();
        });
      });
    };
    fetchNext();

    return () => {
      cancelled = true;
      cancelScheduled();
    };
  }, [user, routeIsSafe, navigationIdle, chunks, schedule]);

  return null;
}
