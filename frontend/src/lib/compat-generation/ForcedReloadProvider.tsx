/**
 * ForcedReloadProvider / useForcedReload
 *
 * Side-effect orchestrator for the API-compatibility forced-reload flow
 * (see docs/docs/plans/2026-08-09-sub-plan-api-compatibility-plan.md).
 * Mirrors the `ConnectivityProvider`/`useConnectivity` pattern: mounted
 * once at the app root, exposing `phase` to whichever components need to
 * react to it — the root-mounted blocking overlay (`ForcedReloadGate`),
 * and `MainLayout`/`TeachingLayout`'s fallback `StatusStrip`, stacked
 * below their own `TopRibbon` alongside the connectivity strip.
 *
 * - First mismatch for a given server generation -> phase "blocking",
 *   persist in-progress form state, reload shortly after — unless this
 *   tab is currently offline, in which case a reload would just fail to
 *   reach anything, so go straight to phase "fallback" instead.
 * - Mismatch still present for that *same* generation (the reload didn't
 *   fix it) -> phase "fallback", plus a background retry every
 *   `RETRY_INTERVAL_MS` that re-checks compatibility via a lightweight
 *   request (never a blind reload with no evidence).
 * - A mismatch event received while a transition is already in flight
 *   (`phase !== "idle"`) is ignored, so it can't overwrite a pending
 *   reload/fallback decision.
 */

/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { useConnectivity } from "@/lib/connectivity";
import { COMPAT_MISMATCH_EVENT } from "./compatGeneration";
import {
  decideRetryAction,
  hasPendingRetryRecord,
  RETRY_INTERVAL_MS,
} from "./retryState";
import { persistFormState, restoreFormState } from "./formStatePersistence";

/** How long the blocking "Updating…" overlay shows before reloading. */
const BLOCKING_DISPLAY_MS = 800;

export type ForcedReloadPhase = "idle" | "blocking" | "fallback";

export interface ForcedReloadCtx {
  phase: ForcedReloadPhase;
}

const Context = createContext<ForcedReloadCtx | undefined>(undefined);

export function ForcedReloadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<ForcedReloadPhase>("idle");
  const phaseRef = useRef<ForcedReloadPhase>("idle");
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isOnline } = useConnectivity();
  const isOnlineRef = useRef(isOnline);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  function transitionTo(next: ForcedReloadPhase): void {
    phaseRef.current = next;
    setPhase(next);
  }

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
      // A transition is already in flight — ignore rather than overwrite it.
      if (phaseRef.current !== "idle") return;

      const detail = (event as CustomEvent<{ serverGeneration: number }>)
        .detail;
      const decision = decideRetryAction(detail.serverGeneration, Date.now());

      persistFormState(window.location.pathname);

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      // Offline: a reload would just fail to reach the new bundle's
      // matching backend — go straight to the fallback state instead.
      if (decision.action === "reload-now" && isOnlineRef.current) {
        transitionTo("blocking");
        setTimeout(() => {
          window.location.reload();
        }, BLOCKING_DISPLAY_MS);
        return;
      }

      transitionTo("fallback");
      const waitMs =
        decision.action === "reload-now" ? RETRY_INTERVAL_MS : decision.waitMs;
      retryTimerRef.current = setTimeout(() => {
        void api.get("/health").catch(() => {
          /* transient network errors are handled elsewhere (ConnectivityContext) */
        });
      }, waitMs);
    }

    window.addEventListener(COMPAT_MISMATCH_EVENT, handleMismatch);
    return () => {
      window.removeEventListener(COMPAT_MISMATCH_EVENT, handleMismatch);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return <Context.Provider value={{ phase }}>{children}</Context.Provider>;
}

/**
 * useForcedReload
 *
 * Access the current forced-reload phase from any component within the
 * ForcedReloadProvider tree.
 */
export function useForcedReload(): ForcedReloadCtx {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useForcedReload must be used within ForcedReloadProvider");
  }
  return ctx;
}
