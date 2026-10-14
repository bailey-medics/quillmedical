import { describe, it, expect } from "vitest";
import { formatPosterTime, parsePosterTime } from "./posterTime";

describe("parsePosterTime", () => {
  it.each([
    ["85", 85],
    ["0", 0],
    ["1:25", 85],
    ["0:05", 5],
    [" 2:00 ", 120],
    ["1:02:05", 3725],
  ])("reads %j as %i seconds", (text, seconds) => {
    expect(parsePosterTime(text)).toBe(seconds);
  });

  it.each(["", "soon", "-3", "4.5", "1:75", "1:2:3:4", "1:", "86401"])(
    "refuses %j",
    (text) => {
      expect(parsePosterTime(text)).toBeNull();
    },
  );
});

describe("formatPosterTime", () => {
  it.each([
    [5, "0:05"],
    [85, "1:25"],
    [600, "10:00"],
    [3725, "1:02:05"],
  ])("shows %i seconds as %s", (seconds, text) => {
    expect(formatPosterTime(seconds)).toBe(text);
  });
});
