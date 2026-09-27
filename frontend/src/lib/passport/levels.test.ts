import { describe, expect, it } from "vitest";
import { levelsFor } from "./levels";

describe("levelsFor", () => {
  it("gives a scaled competency's levels in the scale's order", () => {
    expect(
      levelsFor("define_radiotherapy_target_volume").map((l) => l.id),
    ).toEqual([
      "observe_only",
      "direct_supervision",
      "indirect_supervision",
      "unsupervised",
    ]);
  });

  it("gives nothing for a competency with no scale", () => {
    expect(levelsFor("perform_cannulation")).toEqual([]);
  });

  it("gives nothing for an unknown competency", () => {
    expect(levelsFor("not_a_competency")).toEqual([]);
  });
});
