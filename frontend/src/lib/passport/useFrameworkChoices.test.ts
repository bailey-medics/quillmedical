import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFrameworkChoices } from "./useFrameworkChoices";
import type * as apiLib from "./api";
import { TEST_FRAMEWORK_CATALOGUE } from "@test/frameworkCatalogue";

const { fetchPassportFrameworks } = vi.hoisted(() => ({
  fetchPassportFrameworks: vi.fn<typeof apiLib.fetchPassportFrameworks>(),
}));

vi.mock("./api", () => ({
  fetchPassportFrameworks,
}));

const LEAD_FIRST = [
  {
    id: "oncology",
    name: "Oncology (proof of concept)",
    publisher: "Quill Medical",
    specialties: ["oncology"],
    lead: true,
    items: 16,
  },
];

describe("useFrameworkChoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with the alphabetical list, so the question can be answered at once", () => {
    fetchPassportFrameworks.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useFrameworkChoices(true));

    expect(result.current).toEqual(TEST_FRAMEWORK_CATALOGUE.frameworks);
  });

  it("switches to the order the API gives", async () => {
    fetchPassportFrameworks.mockResolvedValue(LEAD_FIRST);

    const { result } = renderHook(() => useFrameworkChoices(true));

    await waitFor(() => expect(result.current).toEqual(LEAD_FIRST));
  });

  it("asks for nothing until the question is showing", () => {
    renderHook(() => useFrameworkChoices(false));

    expect(fetchPassportFrameworks).not.toHaveBeenCalled();
  });

  it("keeps the alphabetical list when the call fails", async () => {
    fetchPassportFrameworks.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useFrameworkChoices(true));

    await waitFor(() => expect(fetchPassportFrameworks).toHaveBeenCalled());
    expect(result.current).toEqual(TEST_FRAMEWORK_CATALOGUE.frameworks);
  });

  it("keeps the alphabetical list when the answer is empty", async () => {
    fetchPassportFrameworks.mockResolvedValue([]);

    const { result } = renderHook(() => useFrameworkChoices(true));

    await waitFor(() => expect(fetchPassportFrameworks).toHaveBeenCalled());
    expect(result.current).toEqual(TEST_FRAMEWORK_CATALOGUE.frameworks);
  });
});
