/**
 * Tests for the dates a kept record asks again on.
 */

import { describe, it, expect } from "vitest";
import { oneYearOn, tomorrow } from "./retentionReviews";

describe("oneYearOn", () => {
  it("is the same day a year later", () => {
    expect(oneYearOn(new Date(2030, 6, 15))).toBe("2031-07-15");
  });

  it("pads a single-digit month and day", () => {
    expect(oneYearOn(new Date(2030, 0, 5))).toBe("2031-01-05");
  });

  it("gives 28 February for a year on from 29 February", () => {
    expect(oneYearOn(new Date(2028, 1, 29))).toBe("2029-02-28");
  });
});

describe("tomorrow", () => {
  it("is the next day", () => {
    expect(tomorrow(new Date(2030, 6, 15))).toBe("2030-07-16");
  });

  it("rolls over the end of a month and a year", () => {
    expect(tomorrow(new Date(2030, 11, 31))).toBe("2031-01-01");
  });
});
