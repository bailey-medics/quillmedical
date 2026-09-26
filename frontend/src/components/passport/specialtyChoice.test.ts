/**
 * The specialty choice rules.
 */

import { describe, expect, it } from "vitest";
import {
  GENERIC_CHOICE,
  nextSpecialtyValue,
  specialtyGroup,
} from "./specialtyChoice";

describe("specialtyGroup", () => {
  it("says common, never required", () => {
    // "Required" would assert a sufficiency judgement the passport
    // deliberately refuses to make.
    expect(specialtyGroup("General medicine")).toBe(
      "Common in general medicine",
    );
    expect(specialtyGroup("Oncology")).not.toMatch(/required/i);
  });
});

describe("nextSpecialtyValue", () => {
  it("is unanswered when nothing is selected", () => {
    expect(nextSpecialtyValue([], [])).toBeNull();
  });

  it("treats a specialty chosen from unanswered as that specialty", () => {
    expect(nextSpecialtyValue(null, ["oncology"])).toEqual(["oncology"]);
  });

  it("keeps Generic when Generic is all that is selected", () => {
    expect(nextSpecialtyValue([], [GENERIC_CHOICE])).toEqual([]);
  });
});
