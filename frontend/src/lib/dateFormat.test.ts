import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { DATE_LOCALE, dateLocaleFor, formatInDateOrder } from "./dateFormat";

const MARCH_27 = new Date(Date.UTC(2026, 2, 27, 14, 5));
const IN_UTC = { timeZone: "UTC" } as const;

describe("dateLocaleFor", () => {
  it("writes a day-first date in British English", () => {
    expect(dateLocaleFor("dmy")).toBe("en-GB");
  });

  it("writes a month-first date in American English", () => {
    expect(dateLocaleFor("mdy")).toBe("en-US");
  });
});

describe("DATE_LOCALE", () => {
  it("is British for this deployment, whose jurisdiction reads day first", () => {
    expect(DATE_LOCALE).toBe("en-GB");
  });
});

describe("formatInDateOrder", () => {
  const LONG = { day: "numeric", month: "long", year: "numeric" } as const;

  it("puts the day first by default", () => {
    expect(formatInDateOrder(MARCH_27, { ...LONG, ...IN_UTC })).toBe(
      "27 March 2026",
    );
  });

  it("puts the month first in American English", () => {
    expect(formatInDateOrder(MARCH_27, { ...LONG, ...IN_UTC }, "en-US")).toBe(
      "March 27, 2026",
    );
  });

  it("swaps a numeric date's day and month", () => {
    const numeric = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...IN_UTC,
    } as const;

    expect(formatInDateOrder(MARCH_27, numeric)).toBe("27/03/2026");
    expect(formatInDateOrder(MARCH_27, numeric, "en-US")).toBe("03/27/2026");
  });

  it("shows only the date when given only date parts", () => {
    expect(formatInDateOrder(MARCH_27, { ...LONG, ...IN_UTC })).not.toMatch(
      /14/,
    );
  });

  it("shows the time when asked, in each locale's own clock", () => {
    const withTime = {
      ...LONG,
      hour: "2-digit",
      minute: "2-digit",
      ...IN_UTC,
    } as const;

    expect(formatInDateOrder(MARCH_27, withTime)).toBe(
      "27 March 2026 at 14:05",
    );
    expect(formatInDateOrder(MARCH_27, withTime, "en-US")).toBe(
      "March 27, 2026 at 02:05 PM",
    );
  });
});

// Every file of the app's own source, tests and stories left out: they
// name a locale on purpose, to check or show one.
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : sourceFiles(full);
    }

    const isSource = /\.tsx?$/.test(entry.name);
    const isTestOrStory = /\.(test|stories)\.tsx?$/.test(entry.name);
    return isSource && !isTestOrStory ? [full] : [];
  });
}

/** A file's code, with its comment lines left out. */
function codeOf(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

describe("where dates are formatted", () => {
  const SRC = path.join(__dirname, "..");
  const OWN_FILE = path.join(__dirname, "dateFormat.ts");
  const files = sourceFiles(SRC).filter((file) => file !== OWN_FILE);

  it("names a date locale only in dateFormat.ts", () => {
    // A hard-coded "en-GB" shows an American reader a British date.
    const naming = files.filter((file) =>
      /["'](en-GB|en-US)["']/.test(codeOf(file)),
    );

    expect(naming.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("never leaves the locale to the browser", () => {
    // A bare toLocaleDateString() follows the browser's language, so a
    // British reader with an American browser sees month first.
    const bare = files.filter((file) =>
      /\.toLocale(Date|Time)?String\(\s*\)/.test(codeOf(file)),
    );

    expect(bare.map((file) => path.relative(SRC, file))).toEqual([]);
  });
});
