/**
 * How this device installs Quill, kept current as the browser changes its mind
 *
 * Wraps the install prompt store and `detectInstallRoute` for React. A
 * `beforeinstallprompt` that arrives after the page has rendered moves the
 * route from `chromium-manual` to `prompt` without a reload, and an install
 * by any route moves it to `installed`.
 *
 * `installed` also covers a normal browser tab once this device has recorded
 * an install. Chrome stops offering `beforeinstallprompt` once Quill is
 * installed, so without the recorded flag the tab would drop back to
 * `chromium-manual` and give steps for an install that has already
 * happened. On iOS, Safari and the home-screen app keep separate storage,
 * so a Safari tab cannot know; that is accepted.
 */

import { useCallback, useReducer, useSyncExternalStore } from "react";
import {
  installPromptCapture,
  type InstallOutcome,
  type InstallPromptCapture,
} from "./installPromptEvent";
import {
  isInstallFinished,
  markInstallFinished,
} from "./installPromptSchedule";
import {
  detectInstallRoute,
  readInstallEnvironment,
  type InstallEnvironment,
  type InstallRoute,
} from "./installRoute";

export interface UseInstallRouteOptions {
  /** The prompt store. Tests pass their own. */
  capture?: InstallPromptCapture;
  /** Reads the browser. Tests pass a fixed environment. */
  readEnvironment?: (hasDeferredPrompt: boolean) => InstallEnvironment;
  /** Whether this device has recorded an install. */
  isFinished?: () => boolean;
  /** Record an install. */
  markFinished?: () => void;
}

export interface UseInstallRouteResult {
  route: InstallRoute;
  /**
   * Open the browser's install dialog. Resolves to what the user chose, or
   * `null` when the browser has no prompt to show.
   */
  install: () => Promise<InstallOutcome | null>;
}

export function useInstallRoute({
  capture = installPromptCapture,
  readEnvironment = readInstallEnvironment,
  isFinished = isInstallFinished,
  markFinished = markInstallFinished,
}: UseInstallRouteOptions = {}): UseInstallRouteResult {
  const deferred = useSyncExternalStore(
    capture.subscribe,
    capture.getDeferredPrompt,
  );
  const installedNow = useSyncExternalStore(
    capture.subscribe,
    capture.wasInstalled,
  );
  // Recording an install does not go through the store, so the hook asks
  // itself to render again when it records one.
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const route: InstallRoute =
    installedNow || isFinished()
      ? "installed"
      : detectInstallRoute(readEnvironment(deferred !== null));

  const install = useCallback(async (): Promise<InstallOutcome | null> => {
    const event = capture.getDeferredPrompt();
    if (event === null) return null;
    // A prompt can be shown once. Chrome may offer a fresh one later.
    capture.clearDeferredPrompt();
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      markFinished();
      rerender();
    }
    return outcome;
  }, [capture, markFinished]);

  return { route, install };
}
