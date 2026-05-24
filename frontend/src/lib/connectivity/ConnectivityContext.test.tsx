/**
 * Tests for ConnectivityContext
 *
 * Verifies the connectivity provider correctly handles browser events,
 * custom DOM events, debouncing, and health check polling.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectivityProvider, useConnectivity } from "./ConnectivityContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConnectivityProvider>{children}</ConnectivityProvider>;
}

describe("ConnectivityContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default: browser reports online
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
    // Mock fetch for health checks
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("data-offline");
  });

  /** Flush microtask queue (for async fetch mock resolution) */
  async function flushPromises() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("initial state matches navigator.onLine (true)", () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isChecking).toBe(false);
    expect(result.current.showOfflineModal).toBe(false);
  });

  it("initial state matches navigator.onLine (false)", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const { result } = renderHook(() => useConnectivity(), { wrapper });
    expect(result.current.isOnline).toBe(false);
  });

  it("goes offline after debounce on browser offline event", async () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });
    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    // Still online during debounce
    expect(result.current.isOnline).toBe(true);

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("runs health check on browser online event before marking online", async () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    // Go offline first
    act(() => {
      window.dispatchEvent(new Event("offline"));
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.isOnline).toBe(false);

    // Fire online event — triggers health check
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await flushPromises();

    expect(result.current.isOnline).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("updates lastSyncedAt on app:api-success event", () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });
    expect(result.current.lastSyncedAt).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("app:api-success"));
    });

    expect(result.current.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("sets showOfflineModal on app:network-error event after debounce", () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    act(() => {
      window.dispatchEvent(new Event("app:network-error"));
    });

    // Still not showing during debounce
    expect(result.current.showOfflineModal).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(result.current.showOfflineModal).toBe(true);
    expect(result.current.isOnline).toBe(false);
  });

  it("dismissOfflineModal clears modal state", () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    act(() => {
      window.dispatchEvent(new Event("app:network-error"));
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.showOfflineModal).toBe(true);

    act(() => {
      result.current.dismissOfflineModal();
    });
    expect(result.current.showOfflineModal).toBe(false);
  });

  it("triggerOfflineModal sets modal state", () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    act(() => {
      result.current.triggerOfflineModal();
    });
    expect(result.current.showOfflineModal).toBe(true);
  });

  it("polls health check when offline", () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    // Go offline
    act(() => {
      window.dispatchEvent(new Event("offline"));
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.isOnline).toBe(false);

    // Advance to trigger poll
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    // Health check should have been called (initial online check + poll)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("retry triggers health check", async () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    act(() => {
      result.current.retry();
    });

    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sets data-offline attribute when offline", () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    act(() => {
      window.dispatchEvent(new Event("offline"));
      vi.advanceTimersByTime(1100);
    });

    expect(result.current.isOnline).toBe(false);
    expect(document.documentElement.hasAttribute("data-offline")).toBe(true);
  });

  it("removes data-offline attribute when online", async () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    // Go offline
    act(() => {
      window.dispatchEvent(new Event("offline"));
      vi.advanceTimersByTime(1100);
    });
    expect(document.documentElement.hasAttribute("data-offline")).toBe(true);

    // Come back online
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await flushPromises();

    expect(result.current.isOnline).toBe(true);
    expect(document.documentElement.hasAttribute("data-offline")).toBe(false);
  });

  it("sets isReconnected when transitioning from offline to online", async () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    // Go offline
    act(() => {
      window.dispatchEvent(new Event("offline"));
      vi.advanceTimersByTime(1100);
    });

    // Come back online
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await flushPromises();

    expect(result.current.isReconnected).toBe(true);
  });

  it("clearReconnected resets reconnected state", async () => {
    const { result } = renderHook(() => useConnectivity(), { wrapper });

    // Go offline then online
    act(() => {
      window.dispatchEvent(new Event("offline"));
      vi.advanceTimersByTime(1100);
    });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await flushPromises();

    expect(result.current.isReconnected).toBe(true);

    act(() => {
      result.current.clearReconnected();
    });
    expect(result.current.isReconnected).toBe(false);
  });

  it("throws when used outside provider", () => {
    // Suppress console.error from React for expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useConnectivity());
    }).toThrow("useConnectivity must be used within ConnectivityProvider");
    spy.mockRestore();
  });
});
