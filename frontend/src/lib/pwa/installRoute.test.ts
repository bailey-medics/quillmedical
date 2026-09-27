import { describe, expect, it } from "vitest";
import { detectInstallRoute, type InstallEnvironment } from "./installRoute";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  iphoneWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iphoneGoogleApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.0 Mobile/15E148 Safari/604.1",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  macSafari16:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  macFirefox:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
  windowsFirefox143:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  windowsFirefox142:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
  linuxFirefox:
    "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0",
};

function env(overrides: Partial<InstallEnvironment>): InstallEnvironment {
  return {
    userAgent: UA.macChrome,
    maxTouchPoints: 0,
    hasDeferredPrompt: false,
    isStandalone: false,
    ...overrides,
  };
}

describe("detectInstallRoute", () => {
  it("reports installed when running standalone, even with a prompt held", () => {
    expect(
      detectInstallRoute(env({ isStandalone: true, hasDeferredPrompt: true })),
    ).toBe("installed");
  });

  it("uses the prompt whenever the browser has offered one", () => {
    expect(detectInstallRoute(env({ hasDeferredPrompt: true }))).toBe("prompt");
    expect(
      detectInstallRoute(
        env({ userAgent: UA.androidChrome, hasDeferredPrompt: true }),
      ),
    ).toBe("prompt");
  });

  it("falls back to the browser menu for Chromium with no prompt", () => {
    expect(detectInstallRoute(env({ userAgent: UA.macChrome }))).toBe(
      "chromium-manual",
    );
    expect(detectInstallRoute(env({ userAgent: UA.windowsEdge }))).toBe(
      "chromium-manual",
    );
    expect(detectInstallRoute(env({ userAgent: UA.androidChrome }))).toBe(
      "chromium-manual",
    );
  });

  it("gives the share sheet to every real iOS browser", () => {
    expect(detectInstallRoute(env({ userAgent: UA.iphoneSafari }))).toBe("ios");
    expect(detectInstallRoute(env({ userAgent: UA.iphoneChrome }))).toBe("ios");
  });

  it("treats a Mac user agent with a touch screen as an iPad", () => {
    expect(
      detectInstallRoute(env({ userAgent: UA.macSafari, maxTouchPoints: 5 })),
    ).toBe("ios");
  });

  it("sends Safari 17 and later on a Mac to Add to Dock", () => {
    expect(detectInstallRoute(env({ userAgent: UA.macSafari }))).toBe(
      "macos-safari",
    );
  });

  it("cannot install from Safari before 17 on a Mac", () => {
    expect(detectInstallRoute(env({ userAgent: UA.macSafari16 }))).toBe(
      "unsupported",
    );
  });

  it("sends Firefox on Android to its menu", () => {
    expect(detectInstallRoute(env({ userAgent: UA.androidFirefox }))).toBe(
      "android-firefox",
    );
  });

  it("sends Firefox 143 and later on Windows to Add tab to taskbar", () => {
    expect(detectInstallRoute(env({ userAgent: UA.windowsFirefox143 }))).toBe(
      "windows-firefox",
    );
    expect(detectInstallRoute(env({ userAgent: UA.windowsFirefox142 }))).toBe(
      "unsupported",
    );
  });

  it("cannot install from Firefox on a Mac or Linux", () => {
    expect(detectInstallRoute(env({ userAgent: UA.macFirefox }))).toBe(
      "unsupported",
    );
    expect(detectInstallRoute(env({ userAgent: UA.linuxFirefox }))).toBe(
      "unsupported",
    );
  });

  it("cannot install from an in-app browser", () => {
    expect(detectInstallRoute(env({ userAgent: UA.iphoneWebView }))).toBe(
      "unsupported",
    );
    expect(detectInstallRoute(env({ userAgent: UA.iphoneGoogleApp }))).toBe(
      "unsupported",
    );
    expect(detectInstallRoute(env({ userAgent: UA.androidWebView }))).toBe(
      "unsupported",
    );
  });

  it("cannot install from an unknown browser", () => {
    expect(detectInstallRoute(env({ userAgent: "curl/8.7.1" }))).toBe(
      "unsupported",
    );
  });
});
