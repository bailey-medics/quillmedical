/**
 * Navigation Blocker
 *
 * Blocks React Router navigation when the app is offline.
 * When a navigation attempt is intercepted, triggers the offline modal
 * and resets the blocker so the user stays on their current page.
 *
 * Must be rendered inside both a Router and ConnectivityProvider context.
 */

import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

import { useConnectivity } from "./ConnectivityContext";

export function NavigationBlocker() {
  const { isOnline, triggerOfflineModal } = useConnectivity();

  const blocker = useBlocker(!isOnline);

  useEffect(() => {
    if (blocker.state === "blocked") {
      triggerOfflineModal();
      blocker.reset();
    }
  }, [blocker, triggerOfflineModal]);

  return null;
}
