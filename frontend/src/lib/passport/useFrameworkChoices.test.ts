import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { FRAMEWORK_OPTIONS } from "./frameworks";
import { useFrameworkChoices } from "./useFrameworkChoices";

const fetchPassportFrameworks = vi.fn();

vi.mock("./api", () => ({
  fetchPassportFrameworks: (...args: unknown[]) =>
    fetchPassportFrameworks(...args),
}));

const LEAD_FIRST = [
  {
    id: "oncology",
    name: "Oncology (proof of concept)",
    publisher: "Quill Medical",
    version: "2026",
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

    expect(result.current).toEqual(FRAMEWORK_OPTIONS);
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
    expect(result.current).toEqual(FRAMEWORK_OPTIONS);
  });

  it("keeps the alphabetical list when the answer is empty", async () => {
    fetchPassportFrameworks.mockResolvedValue([]);

    const { result } = renderHook(() => useFrameworkChoices(true));

    await waitFor(() => expect(fetchPassportFrameworks).toHaveBeenCalled());
    expect(result.current).toEqual(FRAMEWORK_OPTIONS);
  });
});
