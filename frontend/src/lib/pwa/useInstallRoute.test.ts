import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createInstallPromptCapture,
  type InstallOutcome,
} from "./installPromptEvent";
import type { InstallEnvironment } from "./installRoute";
import { useInstallRoute } from "./useInstallRoute";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

function environment(hasDeferredPrompt: boolean): InstallEnvironment {
  return {
    userAgent: CHROME_MAC,
    maxTouchPoints: 0,
    hasDeferredPrompt,
    isStandalone: false,
  };
}

function promptEvent(outcome: InstallOutcome) {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
}

function setUp(finished = false) {
  const target = new EventTarget();
  const capture = createInstallPromptCapture();
  capture.wire(target);
  let recorded = finished;
  const markFinished = vi.fn(() => {
    recorded = true;
  });
  const hook = renderHook(() =>
    useInstallRoute({
      capture,
      readEnvironment: environment,
      isFinished: () => recorded,
      markFinished,
    }),
  );
  return { target, capture, markFinished, hook };
}

describe("useInstallRoute", () => {
  it("gives the browser menu route while no prompt is held", () => {
    const { hook } = setUp();
    expect(hook.result.current.route).toBe("chromium-manual");
  });

  it("moves to the prompt route when a prompt arrives late", () => {
    const { hook, target } = setUp();

    act(() => {
      target.dispatchEvent(promptEvent("accepted"));
    });

    expect(hook.result.current.route).toBe("prompt");
  });

  it("reports installed once this device has recorded an install", () => {
    const { hook } = setUp(true);
    expect(hook.result.current.route).toBe("installed");
  });

  it("reports installed when the browser fires appinstalled", () => {
    const { hook, target } = setUp();

    act(() => {
      target.dispatchEvent(new Event("appinstalled"));
    });

    expect(hook.result.current.route).toBe("installed");
  });

  it("opens the browser's dialog and records an accepted install", async () => {
    const { hook, target, markFinished } = setUp();
    const event = promptEvent("accepted");
    act(() => {
      target.dispatchEvent(event);
    });

    let outcome: InstallOutcome | null = null;
    await act(async () => {
      outcome = await hook.result.current.install();
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("accepted");
    expect(markFinished).toHaveBeenCalledTimes(1);
    expect(hook.result.current.route).toBe("installed");
  });

  it("does not record a dismissed install, and drops the used prompt", async () => {
    const { hook, target, markFinished, capture } = setUp();
    act(() => {
      target.dispatchEvent(promptEvent("dismissed"));
    });

    await act(async () => {
      await hook.result.current.install();
    });

    expect(markFinished).not.toHaveBeenCalled();
    expect(capture.getDeferredPrompt()).toBeNull();
    expect(hook.result.current.route).toBe("chromium-manual");
  });

  it("resolves to null when there is no prompt to show", async () => {
    const { hook } = setUp();
    let outcome: InstallOutcome | null = "accepted";
    await act(async () => {
      outcome = await hook.result.current.install();
    });
    expect(outcome).toBeNull();
  });
});
