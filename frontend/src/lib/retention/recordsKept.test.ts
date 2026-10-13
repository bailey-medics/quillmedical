/**
 * Tests for reading and setting an organisation's retention period.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as apiLib from "@/lib/api";
import { getRecordsKept, periodInWords, setRecordsKept } from "./recordsKept";

const kept = { org_unit_id: 3, organisation: "Academy", months: 42 };

describe("periodInWords", () => {
  it("says when none is set", () => {
    expect(periodInWords(null)).toBe("Not set");
  });

  it("counts months, and one month as one", () => {
    expect(periodInWords(42)).toBe("42 months");
    expect(periodInWords(1)).toBe("1 month");
  });
});

describe("the period's API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reads one organisation's period", async () => {
    const get = vi.spyOn(apiLib.api, "get").mockResolvedValue(kept);

    expect(await getRecordsKept(3)).toEqual(kept);
    expect(get).toHaveBeenCalledWith("/retention/periods/3");
  });

  it("sends the months to set", async () => {
    const put = vi.spyOn(apiLib.api, "put").mockResolvedValue(kept);

    await setRecordsKept(3, 42);

    expect(put).toHaveBeenCalledWith("/retention/periods/3", { months: 42 });
  });

  it("sends null to clear it, never leaves the field out", async () => {
    const put = vi
      .spyOn(apiLib.api, "put")
      .mockResolvedValue({ ...kept, months: null });

    await setRecordsKept(3, null);

    expect(put).toHaveBeenCalledWith("/retention/periods/3", { months: null });
  });
});
