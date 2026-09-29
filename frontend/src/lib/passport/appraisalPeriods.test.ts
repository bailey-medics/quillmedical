/**
 * Appraisal period helper tests.
 */

import { describe, expect, it } from "vitest";
import {
  describeLength,
  formatDay,
  juneToJuneYears,
  labelPeriods,
  monthsIn,
  newestFirst,
  periodContains,
  periodKey,
  samePeriod,
} from "./appraisalPeriods";

describe("monthsIn", () => {
  it("counts an appraisal year ending the day before it began as 12", () => {
    expect(monthsIn({ starts_on: "2025-10-01", ends_on: "2026-09-30" })).toBe(
      12,
    );
    expect(monthsIn({ starts_on: "2025-08-01", ends_on: "2026-07-31" })).toBe(
      12,
    );
  });

  it("counts a short period after a change of post", () => {
    expect(monthsIn({ starts_on: "2026-08-01", ends_on: "2026-11-30" })).toBe(
      4,
    );
  });

  it("counts part of a month as nothing", () => {
    expect(monthsIn({ starts_on: "2026-08-10", ends_on: "2026-08-20" })).toBe(
      0,
    );
  });

  it("copes with a period ending at the end of February", () => {
    expect(monthsIn({ starts_on: "2025-03-01", ends_on: "2026-02-28" })).toBe(
      12,
    );
  });
});

describe("describeLength", () => {
  it("says months, in the singular for one", () => {
    expect(
      describeLength({ starts_on: "2025-10-01", ends_on: "2026-09-30" }),
    ).toBe("12 months");
    expect(
      describeLength({ starts_on: "2026-01-01", ends_on: "2026-01-31" }),
    ).toBe("1 month");
  });

  it("says so when a period is under a month", () => {
    expect(
      describeLength({ starts_on: "2026-01-05", ends_on: "2026-01-20" }),
    ).toBe("Under a month");
  });
});

describe("newestFirst", () => {
  it("orders by start date, latest first, without changing its input", () => {
    const older = { starts_on: "2024-10-01", ends_on: "2025-09-30" };
    const newer = { starts_on: "2025-10-01", ends_on: "2026-09-30" };
    const input = [older, newer];

    expect(newestFirst(input)).toEqual([newer, older]);
    expect(input).toEqual([older, newer]);
  });
});

describe("samePeriod", () => {
  it("compares both dates", () => {
    const period = { starts_on: "2025-10-01", ends_on: "2026-09-30" };
    expect(samePeriod(period, { ...period })).toBe(true);
    expect(samePeriod(period, { ...period, ends_on: "2026-10-31" })).toBe(
      false,
    );
  });
});

describe("labelPeriods", () => {
  it("names each period by the months it starts and ends in", () => {
    const period = { starts_on: "2025-10-01", ends_on: "2026-09-30" };
    expect(labelPeriods([period]).get(periodKey(period))).toBe(
      "Oct 2025 \u2013 Sep 2026",
    );
  });

  it("gives full dates to periods that would otherwise read alike", () => {
    const first = { starts_on: "2026-08-01", ends_on: "2026-08-10" };
    const second = { starts_on: "2026-08-11", ends_on: "2026-08-31" };
    const other = { starts_on: "2025-08-01", ends_on: "2026-07-31" };
    const labels = labelPeriods([first, second, other]);

    expect(labels.get(periodKey(first))).toBe("1 Aug 2026 \u2013 10 Aug 2026");
    expect(labels.get(periodKey(second))).toBe(
      "11 Aug 2026 \u2013 31 Aug 2026",
    );
    expect(labels.get(periodKey(other))).toBe("Aug 2025 \u2013 Jul 2026");
  });
});

describe("periodContains", () => {
  const period = { starts_on: "2025-08-01", ends_on: "2026-07-31" };

  it("includes both its first and its last day", () => {
    expect(periodContains(period, "2025-08-01")).toBe(true);
    expect(periodContains(period, "2026-07-31")).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(periodContains(period, "2025-07-31")).toBe(false);
    expect(periodContains(period, "2026-08-01")).toBe(false);
  });
});

describe("juneToJuneYears", () => {
  it("starts with the year holding today, newest first", () => {
    const years = juneToJuneYears("2026-09-29");
    expect(years[0]).toEqual({
      starts_on: "2026-06-01",
      ends_on: "2027-05-31",
    });
    expect(years[1]).toEqual({
      starts_on: "2025-06-01",
      ends_on: "2026-05-31",
    });
    expect(years).toHaveLength(5);
  });

  it("counts a date before June in the year that began the June before", () => {
    expect(juneToJuneYears("2026-05-31", undefined, 1)).toEqual([
      { starts_on: "2025-06-01", ends_on: "2026-05-31" },
    ]);
  });

  it("reaches back to the oldest activity, beyond the minimum", () => {
    const years = juneToJuneYears("2026-09-29", "2019-03-01");
    expect(years.at(-1)).toEqual({
      starts_on: "2018-06-01",
      ends_on: "2019-05-31",
    });
    expect(years).toHaveLength(9);
  });
});

describe("formatDay", () => {
  it("reads in British order, without shifting the day", () => {
    expect(formatDay("2025-10-01")).toBe("1 October 2025");
  });
});
