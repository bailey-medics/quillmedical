/**
 * Appraisal period helper tests.
 */

import { describe, expect, it } from "vitest";
import {
  describeLength,
  monthsIn,
  newestFirst,
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
