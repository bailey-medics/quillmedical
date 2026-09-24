import { describe, expect, it } from "vitest";
import {
  AA_LARGE_OR_GRAPHIC,
  AA_TEXT,
  contrastRatio,
  parseHex,
  relativeLuminance,
} from "./contrast";

describe("parseHex", () => {
  it("reads six-digit colours", () => {
    expect(parseHex("#143f6b")).toEqual([20, 63, 107]);
  });

  it("reads three-digit colours", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
  });

  it("ignores case and surrounding space", () => {
    expect(parseHex(" #ABCDEF ")).toEqual([171, 205, 239]);
  });

  it.each(["", "fff", "#ffff", "#gggggg", "var(--x)", "rgb(0,0,0)"])(
    "rejects %j",
    (value) => {
      expect(() => parseHex(value)).toThrow(/Not a hex colour/);
    },
  );
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("is 1 for a colour on itself", () => {
    expect(contrastRatio("#868e96", "#868e96")).toBe(1);
  });

  it("does not depend on order", () => {
    expect(contrastRatio("#12b886", "#ffffff")).toBe(
      contrastRatio("#ffffff", "#12b886"),
    );
  });

  it("matches the ratios axe reported in the baseline", () => {
    // Mantine gray.6 on white, and white on teal.6
    expect(contrastRatio("#868e96", "#ffffff")).toBeCloseTo(3.32, 2);
    expect(contrastRatio("#ffffff", "#12b886")).toBeCloseTo(2.55, 2);
  });

  it("exposes the AA thresholds", () => {
    expect(AA_TEXT).toBe(4.5);
    expect(AA_LARGE_OR_GRAPHIC).toBe(3);
  });
});
