/**
 * The device behind a user agent
 *
 * Feedback stores the browser's user agent as sent. It names the device,
 * its operating system and the browser, but in a form nobody reads at a
 * glance. This turns it into a line such as "iPhone, iOS 18.1, Safari 18".
 *
 * A best guess, shown beside the raw string rather than instead of it.
 * Browsers say less than they used to, and some of it is untrue:
 *
 * - An iPad asks for desktop sites by default, and then says it is a Mac.
 * - macOS and Windows report a frozen version, so none is shown for them.
 * - Chrome on Android gives the model as "K", so only some phones name one.
 */

/** The first capture group of a pattern, or null when it does not match. */
function capture(userAgent: string, pattern: RegExp): string | null {
  return pattern.exec(userAgent)?.[1] ?? null;
}

/** The kind of device, and its model where an Android phone gives one. */
function deviceName(userAgent: string): string | null {
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  if (userAgent.includes("Android")) {
    const kind = userAgent.includes("Mobile")
      ? "Android phone"
      : "Android tablet";
    // "Linux; Android 14; Pixel 8) ..." – the model is the last entry
    // before the bracket closes. Chrome now sends "K" in its place.
    const model = capture(userAgent, /Android [\d.]+; ([^;)]+)\)/)?.trim();
    return model && model !== "K" ? `${kind} (${model})` : kind;
  }
  if (userAgent.includes("CrOS")) return "Chromebook";
  if (userAgent.includes("Macintosh")) return "Mac";
  if (userAgent.includes("Windows")) return "Windows computer";
  if (userAgent.includes("Linux")) return "Linux computer";
  return null;
}

/** The operating system, with a version only where it can be trusted. */
function systemName(userAgent: string): string | null {
  if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    const version = capture(userAgent, / OS (\d+(?:_\d+)?)/);
    const name = userAgent.includes("iPad") ? "iPadOS" : "iOS";
    return version ? `${name} ${version.replace("_", ".")}` : name;
  }
  if (userAgent.includes("Android")) {
    const version = capture(userAgent, /Android (\d+(?:\.\d+)?)/);
    return version ? `Android ${version}` : "Android";
  }
  if (userAgent.includes("CrOS")) return "ChromeOS";
  if (userAgent.includes("Macintosh")) return "macOS";
  if (userAgent.includes("Windows")) return "Windows";
  return null;
}

/**
 * Each browser's own token, most specific first: Edge, Opera and Samsung
 * Internet all say "Chrome" as well, and every one of them says "Safari".
 */
const BROWSERS: readonly (readonly [string, RegExp])[] = [
  ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
  ["Opera", /OPR\/(\d+)/],
  ["Samsung Internet", /SamsungBrowser\/(\d+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
  ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /Version\/(\d+)(?:\.\d+)* .*Safari/],
];

/** The browser and its major version. */
function browserName(userAgent: string): string | null {
  for (const [name, pattern] of BROWSERS) {
    const version = capture(userAgent, pattern);
    if (version) return `${name} ${version}`;
  }
  return null;
}

/**
 * A readable line for a user agent, or null when nothing in it is
 * recognised.
 */
export function describeDevice(userAgent: string): string | null {
  const parts = [
    deviceName(userAgent),
    systemName(userAgent),
    browserName(userAgent),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}
