import { describe, it, expect } from "vitest";
import jurisdictionConfig from "@/generated/jurisdiction-config.json";
import { dateOrderOf, isDateOrder } from "./dateOrder";

describe("isDateOrder", () => {
  it.each(["dmy", "mdy"])("accepts %s", (order) => {
    expect(isDateOrder(order)).toBe(true);
  });

  it.each(["ymd", "DMY", "", undefined, 3])("refuses %s", (order) => {
    expect(isDateOrder(order)).toBe(false);
  });
});

describe("dateOrderOf", () => {
  it("reads a British date day first", () => {
    expect(dateOrderOf("uk")).toBe("dmy");
  });

  it("reads an American date month first", () => {
    expect(dateOrderOf("us")).toBe("mdy");
  });

  it("falls back to day first for a jurisdiction it does not know", () => {
    expect(dateOrderOf("atlantis")).toBe("dmy");
  });

  it("gives every jurisdiction in the shared config an order it knows", () => {
    // A typo in the YAML would otherwise fall back to day first without
    // a word, and an American user would have every date read backwards.
    for (const [id, jurisdiction] of Object.entries(
      jurisdictionConfig.jurisdictions,
    )) {
      expect(isDateOrder(jurisdiction.date_order), id).toBe(true);
    }
  });
});
