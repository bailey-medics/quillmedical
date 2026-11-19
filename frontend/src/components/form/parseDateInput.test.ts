import { describe, it, expect } from "vitest";
import { dateInputMessage, parseDateInput } from "./parseDateInput";

describe("parseDateInput", () => {
  it.each([
    ["03/04/2026", "2026-04-03"],
    ["3/4/2026", "2026-04-03"],
    ["03-04-2026", "2026-04-03"],
    ["03.04.2026", "2026-04-03"],
    ["27 March 2026", "2026-03-27"],
    ["27 mar 2026", "2026-03-27"],
    ["1st Sept 2026", "2026-09-01"],
    ["2026-04-03", "2026-04-03"],
    ["29/02/2028", "2028-02-29"],
    ["  12/05/1980  ", "1980-05-12"],
  ])("reads %s as day, month, year: %s", (text, expected) => {
    expect(parseDateInput(text)).toEqual({ kind: "date", value: expected });
  });

  it("reads 03/04/2026 as 3 April, never 4 March", () => {
    expect(parseDateInput("03/04/2026")).toEqual({
      kind: "date",
      value: "2026-04-03",
    });
  });

  it.each(["1/2/80", "01/02/26", "27 March 80"])(
    "refuses the two-digit year in %s",
    (text) => {
      expect(parseDateInput(text)).toEqual({ kind: "two-digit-year" });
    },
  );

  it.each([
    "31/02/2026",
    "29/02/2026",
    "00/01/2026",
    "12/13/2026",
    "2026-02-30",
    "32 March 2026",
    "27 Marching 2026",
    "next Tuesday",
    "03/04/202",
  ])("refuses %s, a date that does not exist or cannot be read", (text) => {
    expect(parseDateInput(text)).toEqual({ kind: "invalid" });
  });

  it("reads blank text as empty", () => {
    expect(parseDateInput("   ")).toEqual({ kind: "empty" });
  });
});

describe("dateInputMessage", () => {
  it("asks for the year in full for a two-digit year", () => {
    expect(dateInputMessage({ kind: "two-digit-year" })).toBe(
      "Enter the year in full, for example 1980",
    );
  });

  it("asks for a real date when the text could not be read", () => {
    expect(dateInputMessage({ kind: "invalid" })).toMatch(/real date/);
  });

  it("says nothing for a date or for empty text", () => {
    expect(dateInputMessage({ kind: "date", value: "2026-01-01" })).toBeNull();
    expect(dateInputMessage({ kind: "empty" })).toBeNull();
  });
});
