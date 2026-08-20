/**
 * ForcedReloadGate
 *
 * Root-mounted orchestrator for the API-compatibility forced-reload flow
 * (see docs/docs/plans/2026-08-09-sub-plan-api-compatibility-plan.md).
 * Renders nothing by default. When `lib/api.ts`'s response interceptor
 * detects this tab's baked-in generation is older than the backend's
 * (`client-behind`), it dispatches `COMPAT_MISMATCH_EVENT`, which this
 * component listens for:
 *
 * - First mismatch for a given server generation -> blocking "Updating…"
 *   overlay, persist in-progress form state, reload shortly after.
 * - Mismatch still present for that *same* generation (the reload didn't
 *   fix it, e.g. deploy ordering) -> dismissible fallback banner, plus a
 *   background retry every `RETRY_INTERVAL_MS` that re-checks compatibility
 *   via a lightweight request (never a blind reload with no evidence).
 *
 * Must be rendered once, near the app root, outside any specific route's
 * layout, so it applies regardless of which layout (MainLayout vs
 * TeachingLayout) is currently active.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import UpdatingBanner from "@/components/updating-banner/UpdatingBanner";
import UpdateFallbackBanner from "@/components/update-fallback-banner/UpdateFallbackBanner";
import { COMPAT_MISMATCH_EVENT } from "./compatGeneration";
import { decideRetryAction, hasPendingRetryRecord } from "./retryState";
import { persistFormState, restoreFormState } from "./formStatePersistence";

/** How long the blocking "Updating…" overlay shows before reloading. */
const BLOCKING_DISPLAY_MS = 800;

type Phase = "idle" | "blocking" | "fallback";

export default function ForcedReloadGate() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dismissed, setDismissed] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    restoreFormState(window.location.pathname);

    // On a fresh load, if a prior mismatch is still being tracked, check
    // compatibility now rather than waiting for organic traffic — this is
    // a real request through the interceptor, never a blind reload.
    if (hasPendingRetryRecord()) {
      void api.get("/health").catch(() => {
        /* transient network errors are handled elsewhere (ConnectivityContext) */
      });
    }

    function handleMismatch(event: Event): void {
      const detail = (event as CustomEvent<{ serverGeneration: number }>)
        .detail;
      const decision = decideRetryAction(detail.serverGeneration, Date.now());

      persistFormState(window.location.pathname);

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (decision.action === "reload-now") {
        setPhase("blocking");
        setTimeout(() => {
          window.location.reload();
        }, BLOCKING_DISPLAY_MS);
        return;
      }

      setPhase("fallback");
      setDismissed(false);
      retryTimerRef.current = setTimeout(() => {
        void api.get("/health").catch(() => {
          /* transient network errors are handled elsewhere (ConnectivityContext) */
        });
      }, decision.waitMs);
    }

    window.addEventListener(COMPAT_MISMATCH_EVENT, handleMismatch);
    return () => {
      window.removeEventListener(COMPAT_MISMATCH_EVENT, handleMismatch);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  if (phase === "blocking") {
    return <UpdatingBanner blocking />;
  }

  if (phase === "fallback" && !dismissed) {
    return <UpdateFallbackBanner onDismiss={() => setDismissed(true)} />;
  }

  return null;
}
