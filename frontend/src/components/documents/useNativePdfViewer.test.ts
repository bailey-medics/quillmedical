import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNativePdfViewer } from "./useNativePdfViewer";

/** Sets what the browser says about its viewer and its main pointer. */
function browser({
  viewer,
  mouse,
}: {
  viewer: boolean | undefined;
  mouse: boolean;
}) {
  vi.stubGlobal("navigator", { ...navigator, pdfViewerEnabled: viewer });
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: query === "(pointer: fine)" && mouse,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe("useNativePdfViewer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is true for a browser with a viewer and a mouse", () => {
    browser({ viewer: true, mouse: true });

    expect(renderHook(() => useNativePdfViewer()).result.current).toBe(true);
  });

  it("is false on Android, which reports no viewer", () => {
    browser({ viewer: false, mouse: false });

    expect(renderHook(() => useNativePdfViewer()).result.current).toBe(false);
  });

  it("is false on an iPhone, which reports a viewer but has no mouse", () => {
    browser({ viewer: true, mouse: false });

    expect(renderHook(() => useNativePdfViewer()).result.current).toBe(false);
  });

  it("is false with a mouse but no viewer", () => {
    browser({ viewer: false, mouse: true });

    expect(renderHook(() => useNativePdfViewer()).result.current).toBe(false);
  });

  it("is false for an older browser that does not say either way", () => {
    browser({ viewer: undefined, mouse: true });

    expect(renderHook(() => useNativePdfViewer()).result.current).toBe(false);
  });

  it("answers on the first render, so pdf.js is never started and dropped", () => {
    browser({ viewer: true, mouse: true });
    const seen: boolean[] = [];

    renderHook(() => {
      seen.push(useNativePdfViewer());
    });

    expect(seen[0]).toBe(true);
  });
});
