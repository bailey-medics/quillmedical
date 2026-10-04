/**
 * describeDevice tests
 *
 * Real user agents from each kind of device, and the ones that say less
 * than they appear to.
 */

import { describe, expect, it } from "vitest";
import { describeDevice } from "./device";

const CASES: readonly (readonly [string, string, string])[] = [
  [
    "an iPhone in Safari",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "iPhone, iOS 18.1, Safari 18",
  ],
  [
    "an iPhone in Chrome",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
    "iPhone, iOS 17.5, Chrome 126",
  ],
  [
    "an iPad that says it is one",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "iPad, iPadOS 17.4, Safari 17",
  ],
  [
    "an Android phone that names its model",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
    "Android phone (Pixel 8), Android 14, Chrome 125",
  ],
  [
    "an Android phone whose model Chrome hides",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    "Android phone, Android 10, Chrome 126",
  ],
  [
    "an Android tablet",
    "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Android tablet (SM-X700), Android 13, Chrome 124",
  ],
  [
    "Samsung Internet, which also says Chrome",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
    "Android phone (SM-S918B), Android 14, Samsung Internet 25",
  ],
  [
    "a Mac in Safari, with no version for macOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mac, macOS, Safari 17",
  ],
  [
    "Windows in Edge, which also says Chrome",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
    "Windows computer, Windows, Edge 126",
  ],
  [
    "Windows in Firefox",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Windows computer, Windows, Firefox 127",
  ],
  [
    "a Chromebook",
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Chromebook, ChromeOS, Chrome 125",
  ],
  [
    "Linux, which has no system worth naming twice",
    "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Linux computer, Firefox 126",
  ],
];

describe("describeDevice", () => {
  it.each(CASES)("reads %s", (_name, userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it("gives what it can from a cut-off string", () => {
    expect(describeDevice("Mozilla/5.0 (Macintosh)")).toBe("Mac, macOS");
  });

  it.each(["", "curl/8.4.0", "Mozilla/5.0"])(
    "returns null for %j, which names nothing",
    (userAgent) => {
      expect(describeDevice(userAgent)).toBeNull();
    },
  );
});
