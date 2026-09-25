import { describe, expect, it } from "vitest";
import brand from "@/generated/brand.json";
import { brandColours, greyScale, primaryScale, secondaryScale } from "@/theme";
import { brandPalette, resolveColour } from "./brandPalette";

describe("resolveColour", () => {
  it("returns a hex value as it is", () => {
    expect(resolveColour("#343a40")).toBe("#343a40");
  });

  it("turns a palette reference into that shade", () => {
    expect(resolveColour("primary.8")).toBe("#001a36");
    expect(resolveColour("secondary.5")).toBe("#c8963e");
    expect(resolveColour("grey.4")).toBe("#ced4da");
  });

  it("refuses a shade the palette does not have", () => {
    expect(() => resolveColour("grey.9")).toThrow(/No shade 9/);
  });

  it("refuses a palette that does not exist, or a malformed value", () => {
    expect(() => resolveColour("navy.8")).toThrow(/Not a colour/);
    expect(() => resolveColour("#fff")).toThrow(/Not a colour/);
    expect(() => resolveColour("")).toThrow(/Not a colour/);
  });
});

describe("the theme reads its colours from shared/brand.yaml", () => {
  it("takes the brand colours and ramps from the brand file", () => {
    expect(brandColours).toEqual(brand.brand);
    expect([...primaryScale]).toEqual(brandPalette.primary);
    expect([...secondaryScale]).toEqual(brandPalette.secondary);
    expect([...greyScale]).toEqual(brandPalette.grey);
  });

  it("keeps the brand primary at shade 8 and the brand amber at shade 5", () => {
    expect(primaryScale[8]).toBe(brandColours.primary);
    expect(secondaryScale[5]).toBe(brandColours.secondary.toLowerCase());
  });
});
