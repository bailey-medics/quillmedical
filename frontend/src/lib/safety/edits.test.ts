/**
 * Session edits store tests.
 */

import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  documentContentOf,
  officersOf,
  placeholdersOf,
  resetEdits,
  setDocumentContent,
  setOfficer,
  setPlaceholderValue,
  useDocumentContent,
  useOfficers,
  usePlaceholders,
} from "./edits";
import { SAFETY_CASES } from "./fixtures";

afterEach(() => resetEdits());

describe("safety session edits", () => {
  it("starts from the fixtures", () => {
    expect(officersOf("sc-001")).toEqual(SAFETY_CASES[0].officers);
    expect(placeholdersOf("sc-001")).toEqual(SAFETY_CASES[0].placeholders);
    expect(officersOf("sc-999")).toEqual([]);
  });

  it("replaces an officer by role and leaves the others", () => {
    setOfficer("sc-001", {
      role: "Product owner",
      name: "Jo Fletcher",
      email: "jo.fletcher@example.org",
    });
    const officers = officersOf("sc-001");
    expect(officers.find((o) => o.role === "Product owner")?.name).toBe(
      "Jo Fletcher",
    );
    expect(officers).toHaveLength(SAFETY_CASES[0].officers.length);
    expect(officersOf("sc-002")).toEqual(SAFETY_CASES[1].officers);
  });

  it("sets a placeholder value and keeps the key and where it is used", () => {
    setPlaceholderValue("sc-001", "product_version", "4.3");
    const version = placeholdersOf("sc-001").find(
      (p) => p.key === "product_version",
    );
    expect(version?.value).toBe("4.3");
    expect(version?.used_in).toEqual(["Clinical safety case report"]);
  });

  it("re-renders a hook when an edit lands, and not otherwise", () => {
    const { result, rerender } = renderHook(() => usePlaceholders("sc-001"));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    act(() => setPlaceholderValue("sc-001", "review_interval", "6 months"));
    expect(result.current).not.toBe(first);
    expect(result.current.find((p) => p.key === "review_interval")?.value).toBe(
      "6 months",
    );
  });

  it("re-renders the officers hook on an officer edit", () => {
    const { result } = renderHook(() => useOfficers("sc-003"));
    act(() =>
      setOfficer("sc-003", {
        role: "Top management",
        name: "Dr Sam Patel",
        email: "sam.patel@example.org",
      }),
    );
    expect(result.current.find((o) => o.role === "Top management")?.name).toBe(
      "Dr Sam Patel",
    );
  });

  it("replaces a document's markdown and re-renders its hook", () => {
    expect(documentContentOf("sc-001", "crmp")).toBe(
      SAFETY_CASES[0].documents[0].content,
    );
    expect(documentContentOf("sc-001", "nope")).toBeUndefined();
    const { result } = renderHook(() => useDocumentContent("sc-001", "crmp"));
    act(() => setDocumentContent("sc-001", "crmp", "## Rewritten\n\nShort."));
    expect(result.current).toBe("## Rewritten\n\nShort.");
    expect(documentContentOf("sc-001", "cscr")).toBe(
      SAFETY_CASES[0].documents[2].content,
    );
  });
});
