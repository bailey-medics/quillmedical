/**
 * The passport specialties, as the frontend reads them.
 */

import { describe, expect, it } from "vitest";
import { ASSESSABLE_COMPETENCIES } from "@/types/cbac";
import { PASSPORT_SPECIALTIES, getPassportSpecialty } from "./specialties";

describe("PASSPORT_SPECIALTIES", () => {
  it("offers the three starting specialties", () => {
    expect(PASSPORT_SPECIALTIES.map((s) => s.id)).toEqual([
      "general_medicine",
      "general_surgery",
      "oncology",
    ]);
  });

  it("names only competencies the passport can record", () => {
    // The backend refuses to start otherwise; this catches the frontend
    // bundle drifting from it.
    const assessable = new Set(ASSESSABLE_COMPETENCIES.map((c) => c.id));

    for (const specialty of PASSPORT_SPECIALTIES) {
      for (const id of specialty.common_competencies) {
        expect(assessable.has(id)).toBe(true);
      }
    }
  });
});

describe("getPassportSpecialty", () => {
  it("finds a specialty by id", () => {
    expect(getPassportSpecialty("oncology")?.display_name).toBe("Oncology");
  });

  it("returns undefined for a specialty that no longer exists", () => {
    expect(getPassportSpecialty("cardiology")).toBeUndefined();
  });
});
