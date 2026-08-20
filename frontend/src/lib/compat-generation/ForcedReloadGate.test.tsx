import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import ForcedReloadGate from "./ForcedReloadGate";
import { ForcedReloadProvider } from "./ForcedReloadProvider";
import { COMPAT_MISMATCH_EVENT } from "./compatGeneration";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/connectivity", () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

import { api } from "@/lib/api";

function renderGate() {
  return renderWithMantine(
    <ForcedReloadProvider>
      <ForcedReloadGate />
    </ForcedReloadProvider>,
  );
}

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
    renderGate();
    expect(screen.queryByTestId("updating-banner-blocking")).toBeNull();
  });

  it("shows the blocking overlay and reloads on a fresh mismatch", () => {
    renderGate();

    dispatchMismatch(5);

    expect(screen.getByTestId("updating-banner-blocking")).toBeInTheDocument();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("renders nothing once the phase moves to fallback — that strip lives in the layouts", () => {
    const { unmount } = renderGate();
    dispatchMismatch(5);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    unmount();

    renderGate();
    dispatchMismatch(5);

    expect(screen.queryByTestId("updating-banner-blocking")).toBeNull();
  });
});
