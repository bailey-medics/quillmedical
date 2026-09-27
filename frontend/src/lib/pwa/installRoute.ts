/**
 * Works out how Quill can be installed on this device
 *
 * Each device falls into exactly one route. Only `prompt` lets Quill start
 * the install itself; the manual routes each need their own instructions,
 * because every browser hides the option somewhere different.
 *
 * Feature detection decides the two routes a feature can answer: whether
 * Quill is already running as the installed app, and whether the browser
 * has offered an install prompt. The user agent is read only to tell the
 * manual routes apart, where no feature gives the answer.
 *
 * `detectInstallRoute` takes its inputs as an object rather than reading
 * globals, so every branch is tested without a browser.
 */

export type InstallRoute =
  /** Running as the installed app. Never ask. */
  | "installed"
  /** The browser offered `beforeinstallprompt`; Quill can start it. */
  | "prompt"
  /** iPhone or iPad, in any browser: the share sheet. */
  | "ios"
  /** Safari 17 or later on a Mac: File, then Add to Dock. */
  | "macos-safari"
  /** Firefox on Android: the menu, then Add app to Home screen. */
  | "android-firefox"
  /** Firefox 143 or later on Windows: Add tab to taskbar. */
  | "windows-firefox"
  /** A Chromium browser that has not offered a prompt: its menu. */
  | "chromium-manual"
  /** Cannot install here: Firefox on Mac or Linux, in-app browsers. */
  | "unsupported";

export interface InstallEnvironment {
  userAgent: string;
  /** `navigator.maxTouchPoints`, which tells an iPad from a Mac. */
  maxTouchPoints: number;
  /** Whether a `beforeinstallprompt` event is being held. */
  hasDeferredPrompt: boolean;
  /**
   * `display-mode: standalone`, or `navigator.standalone` on iOS, which
   * predates the media query there.
   */
  isStandalone: boolean;
}

/**
 * In-app browsers: a link opened inside another app. None of them can
 * install a web app. Android's WebView marks itself with `; wv)`; the iOS
 * ones either name their app or drop the `Safari/` token Safari and the
 * real iOS browsers all send.
 */
const IN_APP_BROWSER = /; wv\)|FBAN|FBAV|Instagram|LinkedInApp|GSA\//;

function isIos(ua: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS asks for desktop sites, so it reports itself as a Mac. A Mac has
  // no touch screen, so more than one touch point means an iPad.
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

function majorVersion(ua: string, pattern: RegExp): number | null {
  const match = pattern.exec(ua);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isFinite(version) ? version : null;
}

export function detectInstallRoute(env: InstallEnvironment): InstallRoute {
  const {
    userAgent: ua,
    maxTouchPoints,
    hasDeferredPrompt,
    isStandalone,
  } = env;

  if (isStandalone) return "installed";
  if (hasDeferredPrompt) return "prompt";
  if (IN_APP_BROWSER.test(ua)) return "unsupported";

  if (isIos(ua, maxTouchPoints)) {
    // Every real iOS browser sends `Safari/`; an embedded web view does not.
    return /Safari\//.test(ua) ? "ios" : "unsupported";
  }

  if (/Android/.test(ua) && /Firefox\//.test(ua)) return "android-firefox";

  if (/Windows/.test(ua) && /Firefox\//.test(ua)) {
    const version = majorVersion(ua, /Firefox\/(\d+)/);
    return version !== null && version >= 143
      ? "windows-firefox"
      : "unsupported";
  }

  // Chromium browsers also send `Safari/`, so they are ruled out first.
  const isChromium = /Chrome\/|Chromium\/|Edg\//.test(ua);

  if (/Macintosh/.test(ua) && !isChromium && !/Firefox\//.test(ua)) {
    const version = majorVersion(ua, /Version\/(\d+)(?:\.\d+)* Safari\//);
    return version !== null && version >= 17 ? "macos-safari" : "unsupported";
  }

  if (isChromium) return "chromium-manual";

  return "unsupported";
}

/** Read this browser's environment. Kept apart so the rule stays pure. */
export function readInstallEnvironment(
  hasDeferredPrompt: boolean,
): InstallEnvironment {
  const iosStandalone =
    "standalone" in navigator && navigator.standalone === true;
  const displayStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    hasDeferredPrompt,
    isStandalone: iosStandalone || displayStandalone,
  };
}
