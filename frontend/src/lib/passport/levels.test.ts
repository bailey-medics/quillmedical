import { describe, expect, it } from "vitest";
import { levelsFor } from "./levels";
import { TEST_FRAMEWORK_CATALOGUE } from "@test/frameworkCatalogue";

describe("levelsFor", () => {
  it("gives a scaled competency's levels in the scale's order", () => {
    expect(
      levelsFor(
        TEST_FRAMEWORK_CATALOGUE,
        "uk_sact_board_2023_prescribe_sact",
      ).map((l) => l.id),
    ).toEqual([
      "observation_only",
      "review_and_authorise",
      "prescribe_subsequent_cycles",
      "prescribe_first_cycle",
      "prescribe_for_complex_patients",
    ]);
  });

  it("gives nothing for a competency with no scale", () => {
    expect(
      levelsFor(TEST_FRAMEWORK_CATALOGUE, "clinical_perform_cannulation"),
    ).toEqual([]);
  });

  it("gives nothing for an unknown competency", () => {
    expect(levelsFor(TEST_FRAMEWORK_CATALOGUE, "not_a_competency")).toEqual([]);
  });
});

describe("levelsFor before the frameworks have loaded", () => {
  it("gives nothing, so a form offers no choice yet", () => {
    expect(levelsFor(null, "uk_sact_board_2023_prescribe_sact")).toEqual([]);
  });
});
