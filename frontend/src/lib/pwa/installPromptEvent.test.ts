import { describe, expect, it, vi } from "vitest";
import {
  createInstallPromptCapture,
  isBeforeInstallPromptEvent,
} from "./installPromptEvent";

function fakePromptEvent(): Event {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
}

describe("isBeforeInstallPromptEvent", () => {
  it("accepts an event carrying prompt and userChoice", () => {
    expect(isBeforeInstallPromptEvent(fakePromptEvent())).toBe(true);
  });

  it("rejects a plain event of the same name", () => {
    expect(isBeforeInstallPromptEvent(new Event("beforeinstallprompt"))).toBe(
      false,
    );
  });
});

describe("createInstallPromptCapture", () => {
  it("holds the event and stops the browser's own infobar", () => {
    const target = new EventTarget();
    const capture = createInstallPromptCapture();
    capture.wire(target);

    const event = fakePromptEvent();
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(capture.getDeferredPrompt()).toBe(event);
  });

  it("tells subscribers about an event that arrives late", () => {
    const target = new EventTarget();
    const capture = createInstallPromptCapture();
    capture.wire(target);
    const listener = vi.fn();
    capture.subscribe(listener);

    target.dispatchEvent(fakePromptEvent());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops telling a subscriber once it unsubscribes", () => {
    const target = new EventTarget();
    const capture = createInstallPromptCapture();
    capture.wire(target);
    const listener = vi.fn();
    const unsubscribe = capture.subscribe(listener);
    unsubscribe();

    target.dispatchEvent(fakePromptEvent());

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores a same-named event with no prompt", () => {
    const target = new EventTarget();
    const capture = createInstallPromptCapture();
    capture.wire(target);

    target.dispatchEvent(new Event("beforeinstallprompt"));

    expect(capture.getDeferredPrompt()).toBeNull();
  });

  it("marks the app installed and drops the prompt on appinstalled", () => {
    const target = new EventTarget();
    const capture = createInstallPromptCapture();
    const onInstalled = vi.fn();
    capture.wire(target, onInstalled);
    target.dispatchEvent(fakePromptEvent());

    target.dispatchEvent(new Event("appinstalled"));

    expect(onInstalled).toHaveBeenCalledTimes(1);
    expect(capture.wasInstalled()).toBe(true);
    expect(capture.getDeferredPrompt()).toBeNull();
  });

  it("forgets a prompt once it has been used", () => {
    const target = new EventTarget();
    const capture = createInstallPromptCapture();
    capture.wire(target);
    target.dispatchEvent(fakePromptEvent());

    capture.clearDeferredPrompt();

    expect(capture.getDeferredPrompt()).toBeNull();
  });

  it("stops listening once unwired", () => {
    const target = new EventTarget();
    const capture = createInstallPromptCapture();
    const unwire = capture.wire(target);
    unwire();

    target.dispatchEvent(fakePromptEvent());

    expect(capture.getDeferredPrompt()).toBeNull();
  });
});
