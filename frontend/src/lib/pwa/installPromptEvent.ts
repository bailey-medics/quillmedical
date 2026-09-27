/**
 * Holds on to the browser's install prompt until Quill decides to use it
 *
 * Chromium browsers (Chrome, Edge, Samsung Internet) fire
 * `beforeinstallprompt` once they judge the page installable. The event
 * carries a `prompt()` that opens the browser's own install confirmation,
 * and it is the only way a web page can start an install itself. It fires
 * once, often before React has mounted, and is lost unless something is
 * already listening, which is why this is wired from `main.tsx` at module
 * load rather than from a hook.
 *
 * `preventDefault()` holds back Chrome's own mini-infobar on Android, so that
 * Quill's schedule decides when anyone is asked. The install icon in the
 * address bar is not affected.
 *
 * `appinstalled` fires however the install happened, including through the
 * browser's own menu, so it is the one reliable signal that Quill is now
 * installed.
 */

/** The outcome the browser reports once its install dialog closes. */
export type InstallOutcome = "accepted" | "dismissed";

/**
 * `beforeinstallprompt` is not in TypeScript's DOM library, because it is
 * not yet a standard. Only the members Quill uses are declared.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: InstallOutcome }>;
}

/** Narrow a plain `Event` to the install prompt, without an `as` cast. */
export function isBeforeInstallPromptEvent(
  event: Event,
): event is BeforeInstallPromptEvent {
  return (
    "prompt" in event &&
    typeof event.prompt === "function" &&
    "userChoice" in event
  );
}

export interface InstallPromptCapture {
  /** Start listening. Returns a function that stops listening. */
  wire(target: EventTarget, onInstalled?: () => void): () => void;
  /** The held event, or `null` when the browser has not offered one. */
  getDeferredPrompt(): BeforeInstallPromptEvent | null;
  /**
   * Forget the held event. A prompt can be shown only once, so it is
   * dropped as soon as it is used; Chrome may offer a fresh one later.
   */
  clearDeferredPrompt(): void;
  /** Called whenever the held event or the installed state changes. */
  subscribe(listener: () => void): () => void;
  /** True once `appinstalled` has fired in this page's lifetime. */
  wasInstalled(): boolean;
}

/** A separate store per call, so tests do not share state. */
export function createInstallPromptCapture(): InstallPromptCapture {
  let deferred: BeforeInstallPromptEvent | null = null;
  let installed = false;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    wire(target, onInstalled) {
      const onBeforeInstallPrompt = (event: Event) => {
        if (!isBeforeInstallPromptEvent(event)) return;
        event.preventDefault();
        deferred = event;
        notify();
      };
      const onAppInstalled = () => {
        deferred = null;
        installed = true;
        onInstalled?.();
        notify();
      };
      target.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      target.addEventListener("appinstalled", onAppInstalled);
      return () => {
        target.removeEventListener(
          "beforeinstallprompt",
          onBeforeInstallPrompt,
        );
        target.removeEventListener("appinstalled", onAppInstalled);
      };
    },
    getDeferredPrompt: () => deferred,
    clearDeferredPrompt() {
      if (deferred === null) return;
      deferred = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    wasInstalled: () => installed,
  };
}

/** The one store the app uses, wired from `main.tsx`. */
export const installPromptCapture = createInstallPromptCapture();
