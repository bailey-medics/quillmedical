/**
 * useSpecialtyChoices: the backend's order when it answers, the
 * alphabetical bundle when it does not.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { PASSPORT_SPECIALTIES } from "./specialties";
import { useSpecialtyChoices } from "./useSpecialtyChoices";

const fetchPassportSpecialties = vi.fn();

vi.mock("./api", () => ({
  fetchPassportSpecialties: () => fetchPassportSpecialties(),
}));

const ONCOLOGY_FIRST = [
  { id: "oncology", display_name: "Oncology", lead: true },
  { id: "general_medicine", display_name: "General medicine", lead: false },
  { id: "general_surgery", display_name: "General surgery", lead: false },
];

function ids(options: { id: string }[]): string[] {
  return options.map((option) => option.id);
}

beforeEach(() => {
  fetchPassportSpecialties.mockReset();
});

describe("useSpecialtyChoices", () => {
  it("starts with the alphabetical list, so the question can be answered at once", () => {
    fetchPassportSpecialties.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSpecialtyChoices(true));

    expect(ids(result.current)).toEqual(ids(PASSPORT_SPECIALTIES));
  });

  it("switches to the order the backend gives", async () => {
    fetchPassportSpecialties.mockResolvedValue(ONCOLOGY_FIRST);

    const { result } = renderHook(() => useSpecialtyChoices(true));

    await waitFor(() =>
      expect(ids(result.current)).toEqual([
        "oncology",
        "general_medicine",
        "general_surgery",
      ]),
    );
  });

  it("keeps the alphabetical list when the call fails", async () => {
    fetchPassportSpecialties.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useSpecialtyChoices(true));

    await waitFor(() => expect(fetchPassportSpecialties).toHaveBeenCalled());
    expect(ids(result.current)).toEqual(ids(PASSPORT_SPECIALTIES));
  });

  it("keeps the alphabetical list when the backend sends nothing", async () => {
    fetchPassportSpecialties.mockResolvedValue([]);

    const { result } = renderHook(() => useSpecialtyChoices(true));

    await waitFor(() => expect(fetchPassportSpecialties).toHaveBeenCalled());
    expect(ids(result.current)).toEqual(ids(PASSPORT_SPECIALTIES));
  });

  it("fetches nothing while the page is not asking", () => {
    renderHook(() => useSpecialtyChoices(false));

    expect(fetchPassportSpecialties).not.toHaveBeenCalled();
  });
});
