import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  FrameworkCatalogue,
  forgetFrameworkCatalogue,
  loadFrameworkCatalogue,
  useFrameworkCatalogue,
} from "./catalogue";
import type * as apiLib from "./api";
import type { FrameworkDefinition } from "./types";

const { fetchFrameworkCatalogue } = vi.hoisted(() => ({
  fetchFrameworkCatalogue: vi.fn<typeof apiLib.fetchFrameworkCatalogue>(),
}));

vi.mock("./api", () => ({
  fetchFrameworkCatalogue,
}));

const SHEET: FrameworkDefinition = {
  id: "sheet",
  name: "A sign-off sheet",
  publisher: "A trust",
  version: 2,
  specialties: ["oncology"],
  competencies: [
    {
      id: "sheet_refer",
      display_name: "Refer a patient",
      // Served in position order; given out of order here to prove the
      // position is what decides.
      levels: [
        { id: "independent", name: "Independent", position: 1 },
        { id: "observed", name: "Observed", position: 0 },
      ],
      scopes: [],
      expires_after_months: 12,
      retired_on: null,
      retired_in_version: null,
    },
    {
      id: "sheet_plan",
      display_name: "Plan",
      levels: [],
      scopes: [
        { id: "lung", name: "Lung" },
        { id: "other", name: "Other" },
      ],
      expires_after_months: null,
      retired_on: "2026-10-01",
      retired_in_version: 2,
    },
  ],
};

const GENERAL: FrameworkDefinition = {
  id: "quill_2_test",
  name: "Quill second test framework",
  publisher: "Quill Medical",
  version: 1,
  specialties: [],
  competencies: [],
};

describe("FrameworkCatalogue", () => {
  const catalogue = new FrameworkCatalogue([SHEET, GENERAL]);

  it("lists the frameworks alphabetically by name", () => {
    expect(catalogue.frameworks.map((f) => f.id)).toEqual([
      "sheet",
      "quill_2_test",
    ]);
  });

  it("gives a competency the shape the generated bundle gave it", () => {
    expect(catalogue.competency("sheet_refer")).toEqual({
      id: "sheet_refer",
      display_name: "Refer a patient",
      assessable: true,
      framework_id: "sheet",
      levels: [
        { id: "observed", name: "Observed" },
        { id: "independent", name: "Independent" },
      ],
      expires_after_months: 12,
    });
  });

  it("offers no level or scope the framework retired", () => {
    const retiring = new FrameworkCatalogue([
      {
        ...SHEET,
        competencies: [
          {
            ...SHEET.competencies[0],
            levels: [
              {
                id: "observed",
                name: "Observed",
                position: 0,
                retired_on: "2026-11-04",
                retired_in_version: 2,
              },
              { id: "independent", name: "Independent", position: 1 },
            ],
          },
        ],
      },
    ]);

    expect(retiring.competency("sheet_refer")?.levels).toEqual([
      { id: "independent", name: "Independent" },
    ]);
  });

  it("keeps a retired competency, marked as retired", () => {
    expect(catalogue.competency("sheet_plan")?.retired_on).toBe("2026-10-01");
    expect(catalogue.competency("sheet_plan")?.scopes).toEqual([
      { id: "lung", name: "Lung" },
      { id: "other", name: "Other" },
    ]);
  });

  it("offers only the active competencies as a framework's items", () => {
    expect(catalogue.frameworkItems("sheet").map((c) => c.id)).toEqual([
      "sheet_refer",
    ]);
    expect(catalogue.frameworkItems("not_a_framework")).toEqual([]);
  });

  it("finds the framework a competency belongs to", () => {
    expect(catalogue.frameworkOf("sheet_plan")?.id).toBe("sheet");
    expect(catalogue.frameworkOf("made_up")).toBeUndefined();
    expect(catalogue.getFramework("made_up")).toBeUndefined();
  });
});

describe("loading the catalogue", () => {
  beforeEach(() => {
    // The setup primes the real frameworks for every test; these test
    // the load itself.
    forgetFrameworkCatalogue();
  });

  afterEach(() => {
    forgetFrameworkCatalogue();
    vi.clearAllMocks();
  });

  it("asks the backend once, however many pages want it", async () => {
    fetchFrameworkCatalogue.mockResolvedValue([SHEET]);

    await Promise.all([loadFrameworkCatalogue(), loadFrameworkCatalogue()]);

    expect(fetchFrameworkCatalogue).toHaveBeenCalledTimes(1);
  });

  it("tries again after a load that failed", async () => {
    fetchFrameworkCatalogue.mockRejectedValueOnce(new Error("offline"));
    fetchFrameworkCatalogue.mockResolvedValueOnce([SHEET]);

    await expect(loadFrameworkCatalogue()).rejects.toThrow("offline");
    const catalogue = await loadFrameworkCatalogue();

    expect(catalogue.getFramework("sheet")?.name).toBe("A sign-off sheet");
  });

  it("gives a page nothing until the frameworks arrive, then them", async () => {
    fetchFrameworkCatalogue.mockResolvedValue([SHEET]);

    const { result } = renderHook(() => useFrameworkCatalogue());

    expect(result.current.catalogue).toBeNull();
    await waitFor(() => {
      expect(result.current.catalogue?.getFramework("sheet")).toBeDefined();
    });
    expect(result.current.failed).toBe(false);
  });

  it("says so when the frameworks cannot be loaded", async () => {
    fetchFrameworkCatalogue.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useFrameworkCatalogue());

    await waitFor(() => {
      expect(result.current.failed).toBe(true);
    });
    expect(result.current.catalogue).toBeNull();
  });
});
