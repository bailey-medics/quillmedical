import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import ForcedReloadGate from "./ForcedReloadGate";
import { COMPAT_MISMATCH_EVENT } from "./compatGeneration";
import { RETRY_INTERVAL_MS } from "./retryState";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue(undefined),
  },
}));

import { api } from "@/lib/api";

function dispatchMismatch(serverGeneration: number): void {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(COMPAT_MISMATCH_EVENT, { detail: { serverGeneration } }),
    );
  });
}

describe("ForcedReloadGate", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadSpy, pathname: "/" },
      writable: true,
    });
    vi.mocked(api.get).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("renders nothing by default", () => {
    renderWithMantine(<ForcedReloadGate />);
    expect(screen.queryByTestId("updating-banner-blocking")).toBeNull();
    expect(screen.queryByTestId("update-fallback-banner")).toBeNull();
  });

  it("shows the blocking overlay and reloads on a fresh mismatch", () => {
    renderWithMantine(<ForcedReloadGate />);

    dispatchMismatch(5);

    expect(screen.getByTestId("updating-banner-blocking")).toBeInTheDocument();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the fallback banner when the same generation mismatches again", () => {
    renderWithMantine(<ForcedReloadGate />);

    dispatchMismatch(5);
    act(() => {
      vi.runOnlyPendingTimers(); // fires the reload() inside the blocking display timer
    });

    // Same generation mismatches again (the reload didn't fix it).
    dispatchMismatch(5);

    expect(screen.getByTestId("update-fallback-banner")).toBeInTheDocument();
  });

  it("dismissing the fallback banner hides it but does not stop background retries", () => {
    renderWithMantine(<ForcedReloadGate />);

    dispatchMismatch(5);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    dispatchMismatch(5);

    expect(screen.getByTestId("update-fallback-banner")).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: /dismiss/i }).click();
    });

    expect(screen.queryByTestId("update-fallback-banner")).toBeNull();

    // The background retry timer should still fire the health check.
    vi.mocked(api.get).mockClear();
    act(() => {
      vi.advanceTimersByTime(RETRY_INTERVAL_MS);
    });
    expect(api.get).toHaveBeenCalledWith("/health");
  });

  it("proactively checks compatibility on mount when a retry record already exists", () => {
    sessionStorage.setItem(
      "quill-forced-reload-retry",
      JSON.stringify({ generation: 5, attempts: 1, nextRetryAt: Date.now() }),
    );

    renderWithMantine(<ForcedReloadGate />);

    expect(api.get).toHaveBeenCalledWith("/health");
  });
});
