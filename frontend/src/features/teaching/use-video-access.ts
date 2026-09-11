/**
 * Holds a video access grant for one module, and renews it silently.
 *
 * The backend mints a Cloud CDN cookie scoped to a single module's URL
 * prefix and sets it `HttpOnly`, so nothing here can read it — which is
 * the point. This hook only tracks *where* video for the module lives
 * and *when* the grant lapses, so the player can build asset URLs and
 * the renewal can happen before a learner notices.
 *
 * Grants are deliberately short. One outlives a logout and outlives an
 * admin removing someone's access, so the window is kept small and
 * refreshed rather than made generous.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

/** Renew this long before expiry, so a slow network never strands the player. */
const RENEW_MARGIN_MS = 5 * 60 * 1000;

interface VideoAccessResponse {
  base_url: string;
  expires_at: string;
}

export interface VideoAccess {
  /** Where this module's video lives; join with a filename from the slide. */
  baseUrl: string | null;
  /** True while the first call is in flight, so the player can wait. */
  loading: boolean;
  /** Set when access was refused or the call failed. */
  error: boolean;
}

/**
 * Request access to a module's video, renewing until unmounted.
 *
 * Pass `null` to hold off — on a slide with no video, for instance —
 * so a module that never plays anything asks for nothing.
 */
export function useVideoAccess(moduleId: string | null): VideoAccess {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Held in a ref rather than state: the timer is cleanup, not render
  // input, and storing it in state would restart the effect each time
  // it was set.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // No module means nothing to ask for. Returning early leaves the
    // state alone rather than resetting it: the "no grant" case is
    // derived on the way out instead, because setting state in an
    // effect body costs a second render pass for no benefit.
    if (!moduleId) return;

    // Guards against a response arriving after the learner has moved on
    // and writing state into an unmounted component.
    let active = true;

    async function requestAccess(isFirstCall: boolean) {
      if (isFirstCall) setLoading(true);
      try {
        const data = await api.post<VideoAccessResponse>(
          `/teaching/modules/${moduleId}/video-access`,
        );
        if (!active) return;

        setBaseUrl(data.base_url);
        setError(false);

        // Schedule the renewal from what the server said, not from a
        // local assumption about how long a grant lasts.
        const expiresIn =
          new Date(data.expires_at).getTime() - Date.now() - RENEW_MARGIN_MS;
        clearTimer();
        if (expiresIn > 0) {
          timerRef.current = setTimeout(() => {
            void requestAccess(false);
          }, expiresIn);
        }
      } catch {
        if (!active) return;
        // A refusal and a network failure look the same to the learner,
        // and the remedy — reload — is the same for both.
        setError(true);
        setBaseUrl(null);
      } finally {
        if (active && isFirstCall) setLoading(false);
      }
    }

    void requestAccess(true);

    return () => {
      active = false;
      clearTimer();
    };
  }, [moduleId, clearTimer]);

  // Derived rather than stored, so a module going null reports "no
  // grant" immediately without an extra render.
  if (!moduleId) return { baseUrl: null, loading: false, error: false };

  return { baseUrl, loading, error };
}
