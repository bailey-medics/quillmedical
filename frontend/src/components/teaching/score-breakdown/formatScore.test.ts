import { describe, it, expect } from "vitest";
import { formatScore } from "./formatScore";

describe("formatScore", () => {
  it("shows a score to two decimal places", () => {
    expect(formatScore(0.6667)).toBe("66.67%");
  });

  it("keeps the trailing zeros of a whole score", () => {
    expect(formatScore(0.5)).toBe("50.00%");
  });

  it("shows a near miss below the pass mark", () => {
    expect(formatScore(0.8496)).toBe("84.96%");
  });

  it("shows nothing scored as zero", () => {
    expect(formatScore(0)).toBe("0.00%");
  });
});
