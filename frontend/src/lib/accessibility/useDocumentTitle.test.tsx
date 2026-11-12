import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { documentTitle, useDocumentTitle } from "./useDocumentTitle";

const original = document.title;

describe("useDocumentTitle", () => {
  afterEach(() => {
    document.title = original;
  });

  it("puts the page first and the site second", () => {
    expect(documentTitle("Settings")).toBe("Settings - Quill Medical");
  });

  it("takes the site's name from the brand, not from index.html", async () => {
    // A build run as Let's Do Digital must say so in every tab, whatever
    // the static index.html said before the app started.
    document.title = "Something else";
    vi.stubEnv("VITE_BRAND", "ldd");
    vi.resetModules();
    const fresh = await import("./useDocumentTitle");

    expect(fresh.documentTitle("Settings")).toBe("Settings - Let's Do Digital");
    vi.unstubAllEnvs();
  });

  it("sets the title while mounted and restores it after", () => {
    const { unmount } = renderHook(() => useDocumentTitle("Clinical notes"));
    expect(document.title).toBe(documentTitle("Clinical notes"));
    unmount();
    expect(document.title).toBe(original);
  });

  it("follows a change of page title", () => {
    const { rerender } = renderHook(
      ({ title }: { title: string }) => useDocumentTitle(title),
      { initialProps: { title: "Question 1" } },
    );
    rerender({ title: "Question 2" });
    expect(document.title).toBe(documentTitle("Question 2"));
  });

  it("leaves the title alone when there is none to give", () => {
    renderHook(() => useDocumentTitle(""));
    expect(document.title).toBe(original);
  });
});
