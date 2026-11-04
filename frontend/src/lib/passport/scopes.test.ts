import { describe, expect, it } from "vitest";
import { nameWithScope, scopesFor } from "./scopes";
import { TEST_FRAMEWORK_CATALOGUE } from "@test/frameworkCatalogue";

describe("scopesFor", () => {
  it("gives a scoped competency's scopes in the catalogue's order", () => {
    const ids = scopesFor(
      TEST_FRAMEWORK_CATALOGUE,
      "uk_sact_board_2023_prescribe_sact",
    ).map((scope) => scope.id);

    expect(ids[0]).toBe("breast");
    expect(ids).toContain("lung");
  });

  it("always offers other, and offers it last", () => {
    const ids = scopesFor(
      TEST_FRAMEWORK_CATALOGUE,
      "uk_sact_board_2023_prescribe_sact",
    ).map((scope) => scope.id);

    expect(ids[ids.length - 1]).toBe("other");
  });

  it("gives nothing for a competency assessed as a whole", () => {
    expect(
      scopesFor(TEST_FRAMEWORK_CATALOGUE, "clinical_perform_cannulation"),
    ).toEqual([]);
  });

  it("gives nothing for an unknown competency", () => {
    expect(scopesFor(TEST_FRAMEWORK_CATALOGUE, "not_a_competency")).toEqual([]);
  });
});

describe("nameWithScope", () => {
  it("puts the scope after the name", () => {
    expect(nameWithScope("Prescribe", { name: "Lung" })).toBe(
      "Prescribe: Lung",
    );
  });

  it("leaves the name alone where there is no scope", () => {
    expect(nameWithScope("Cannulate", null)).toBe("Cannulate");
    expect(nameWithScope("Cannulate", undefined)).toBe("Cannulate");
  });
});

describe("scopesFor before the frameworks have loaded", () => {
  it("gives nothing, so a form offers no choice yet", () => {
    expect(scopesFor(null, "uk_sact_board_2023_prescribe_sact")).toEqual([]);
  });
});
