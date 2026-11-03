import { describe, expect, it } from "vitest";
import { levelsFor } from "./levels";

describe("levelsFor", () => {
  it("gives a scaled competency's levels in the scale's order", () => {
    expect(
      levelsFor("uk_sact_board_2023_prescribe_sact").map((l) => l.id),
    ).toEqual([
      "observation_only",
      "review_and_authorise",
      "prescribe_subsequent_cycles",
      "prescribe_first_cycle",
      "prescribe_for_complex_patients",
    ]);
  });

  it("gives nothing for a competency with no scale", () => {
    expect(levelsFor("clinical_perform_cannulation")).toEqual([]);
  });

  it("gives nothing for an unknown competency", () => {
    expect(levelsFor("not_a_competency")).toEqual([]);
  });
});
