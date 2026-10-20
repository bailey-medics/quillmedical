/**
 * useWakeLockWhile tests
 *
 * The lock must be held exactly while wanted. Held too long, it keeps a
 * screen on after the upload finished; dropped too early, the computer
 * can sleep partway through and cut the upload off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useWakeLockWhile } from "./useWakeLockWhile";

/** A stand-in for the browser's lock, recording whether it was let go. */
class FakeSentinel {
  released = false;
  release = vi.fn(() => {
    this.released = true;

    return Promise.resolve();
  });
}

const request = vi.fn<(type: "screen") => Promise<FakeSentinel>>();
const issued: FakeSentinel[] = [];

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  issued.length = 0;
  request.mockReset();
  request.mockImplementation(() => {
    const sentinel = new FakeSentinel();
    issued.push(sentinel);

    return Promise.resolve(sentinel);
  });
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
  setVisibility("visible");
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("useWakeLockWhile", () => {
  it("asks for nothing while not active", () => {
    renderHook(() => useWakeLockWhile(false));

    expect(request).not.toHaveBeenCalled();
  });

  it("asks for a screen lock while active", async () => {
    renderHook(() => useWakeLockWhile(true));

    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
  });

  it("lets go once no longer active", async () => {
    const { rerender } = renderHook(({ active }) => useWakeLockWhile(active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(issued).toHaveLength(1));

    rerender({ active: false });

    expect(issued[0].release).toHaveBeenCalled();
  });

  it("lets go when the page is left", async () => {
    const { unmount } = renderHook(() => useWakeLockWhile(true));
    await waitFor(() => expect(issued).toHaveLength(1));

    unmount();

    expect(issued[0].release).toHaveBeenCalled();
  });

  it("asks again when the tab comes back, since hiding drops the lock", async () => {
    renderHook(() => useWakeLockWhile(true));
    await waitFor(() => expect(issued).toHaveLength(1));

    // The browser releases the lock itself when the tab is hidden.
    issued[0].released = true;
    setVisibility("hidden");
    setVisibility("visible");

    await waitFor(() => expect(issued).toHaveLength(2));
  });

  it("does not ask while the tab is hidden", async () => {
    setVisibility("hidden");

    renderHook(() => useWakeLockWhile(true));
    await Promise.resolve();

    expect(request).not.toHaveBeenCalled();
  });

  it("carries on quietly when the browser refuses", async () => {
    request.mockRejectedValue(new Error("NotAllowedError"));

    const { unmount } = renderHook(() => useWakeLockWhile(true));

    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(() => unmount()).not.toThrow();
  });

  it("does nothing in a browser without the API", () => {
    Reflect.deleteProperty(navigator, "wakeLock");

    const { unmount } = renderHook(() => useWakeLockWhile(true));

    expect(request).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });

  it("lets go of a lock granted after it stopped being wanted", async () => {
    // The request is still out when the upload ends. The lock that then
    // arrives must not be kept.
    let grant: ((s: FakeSentinel) => void) | undefined;
    const late = new FakeSentinel();
    request.mockImplementation(
      () =>
        new Promise<FakeSentinel>((resolve) => {
          grant = resolve;
        }),
    );
    const { rerender } = renderHook(({ active }) => useWakeLockWhile(active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(grant).toBeDefined());

    rerender({ active: false });
    grant?.(late);

    await waitFor(() => expect(late.release).toHaveBeenCalled());
  });
});
