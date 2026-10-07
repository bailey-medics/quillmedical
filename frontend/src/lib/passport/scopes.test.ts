import { describe, expect, it } from "vitest";
import { scopesFor } from "./scopes";

describe("scopesFor", () => {
  it("gives a scoped competency's scopes in the catalogue's order", () => {
    const ids = scopesFor("prescribe_sact").map((scope) => scope.id);

    expect(ids[0]).toBe("breast");
    expect(ids).toContain("lung");
  });

  it("always offers other, and offers it last", () => {
    const ids = scopesFor("prescribe_sact").map((scope) => scope.id);

    expect(ids[ids.length - 1]).toBe("other");
  });

  it("gives nothing for a competency assessed as a whole", () => {
    expect(scopesFor("perform_cannulation")).toEqual([]);
  });

  it("gives nothing for an unknown competency", () => {
    expect(scopesFor("not_a_competency")).toEqual([]);
  });
});
