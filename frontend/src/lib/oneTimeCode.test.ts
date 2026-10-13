import { describe, expect, it } from "vitest";
import { withoutSpaces } from "./oneTimeCode";

describe("withoutSpaces", () => {
  it.each([
    ["123456", "123456"],
    ["123 456", "123456"],
    [" 123456 ", "123456"],
    ["1 2 3 4 5 6", "123456"],
    ["123\t456\n", "123456"],
    ["123 456", "123456"],
    ["", ""],
    ["   ", ""],
  ])("turns %j into %j", (typed, sent) => {
    expect(withoutSpaces(typed)).toBe(sent);
  });

  it("leaves everything that is not a space alone", () => {
    expect(withoutSpaces("12a-56")).toBe("12a-56");
  });
});
