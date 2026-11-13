import { describe, expect, it } from "vitest";
import { levelsFor } from "./levels";
import { TEST_FRAMEWORK_CATALOGUE } from "@test/frameworkCatalogue";

describe("levelsFor", () => {
  it("gives a scaled competency's levels in the scale's order", () => {
    expect(
      levelsFor(TEST_FRAMEWORK_CATALOGUE, "quill_test_give_a_course").map(
        (l) => l.id,
      ),
    ).toEqual(["observe", "review", "continue", "start", "adapt"]);
  });

  it("gives nothing for a competency with no scale", () => {
    expect(
      levelsFor(TEST_FRAMEWORK_CATALOGUE, "quill_2_test_insert_a_cannula"),
    ).toEqual([]);
  });

  it("gives nothing for an unknown competency", () => {
    expect(levelsFor(TEST_FRAMEWORK_CATALOGUE, "not_a_competency")).toEqual([]);
  });
});

describe("levelsFor before the frameworks have loaded", () => {
  it("gives nothing, so a form offers no choice yet", () => {
    expect(levelsFor(null, "quill_test_give_a_course")).toEqual([]);
  });
});
