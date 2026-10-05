import { describe, expect, it } from "vitest";
import { NAV_DRAWER_OPEN_STATE, asksForOpenDrawer } from "./navDrawerState";

describe("asksForOpenDrawer", () => {
  it("is true for the state a link sends", () => {
    expect(asksForOpenDrawer(NAV_DRAWER_OPEN_STATE)).toBe(true);
  });

  it("is true alongside other router state", () => {
    expect(asksForOpenDrawer({ navDrawerOpen: true, flash: "Saved" })).toBe(
      true,
    );
  });

  it.each([
    ["no state", null],
    ["undefined state", undefined],
    ["a string", "navDrawerOpen"],
    ["unrelated state", { flash: "Saved" }],
    ["a false flag", { navDrawerOpen: false }],
    ["a truthy flag that is not true", { navDrawerOpen: "yes" }],
  ])("is false for %s", (_name, state) => {
    expect(asksForOpenDrawer(state)).toBe(false);
  });
});
