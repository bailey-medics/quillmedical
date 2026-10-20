/**
 * Keep the screen, and so the computer, awake while something matters.
 *
 * A video upload goes straight from the browser to storage, and a
 * computer that sleeps partway cuts it off. The page knows exactly when
 * an upload is running, so it holds a Screen Wake Lock for that long
 * rather than asking every administrator to change their power settings.
 *
 * Best effort, always. The API is missing in older browsers, and a
 * browser may refuse it (a hidden tab, a low battery). Either way the
 * page carries on without it: the upload resumes after a sleep anyway,
 * and the lock only makes that needed less often. Nothing in a web page
 * can stop a laptop sleeping when its lid is closed.
 *
 * The browser drops the lock whenever the tab is hidden, so it is asked
 * for again each time the tab comes back while still wanted.
 */

import { useEffect } from "react";

/** Hold a screen wake lock for as long as *active* is true. */
export function useWakeLockWhile(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const lock = await navigator.wakeLock.request("screen");

        // Let go at once if the effect ended while the request was out.
        if (stopped) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Refused. Nothing to tell the person: the upload goes on, and
        // resumes if the computer sleeps.
      }
    };

    const onVisibility = () => {
      if (sentinel === null || sentinel.released) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel !== null && !sentinel.released) {
        void sentinel.release();
      }
    };
  }, [active]);
}
