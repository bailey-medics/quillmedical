/**
 * Appraisal period helpers.
 *
 * An appraisal period is one of the holder's appraisal years, shown to
 * them as a "CPD date range". These helpers are the arithmetic every
 * page showing one needs, kept in one place so the settings page and the
 * CPD page cannot describe the same range differently.
 */

import type { AppraisalPeriod } from "./types";

/** Parses an ISO `YYYY-MM-DD` date into its parts, without a timezone. */
function parts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

/**
 * How many whole months a period covers, counting both its first and
 * its last day. 1 October 2025 to 30 September 2026 is 12 months, as is
 * 1 August 2025 to 31 July 2026.
 *
 * Worked in calendar parts rather than milliseconds, because a `Date`
 * built from an ISO string is midnight UTC and a clock change would
 * shift a day.
 */
export function monthsIn(period: AppraisalPeriod): number {
  const start = parts(period.starts_on);
  const end = parts(period.ends_on);

  // The day after the last one, so a range ending the day before its
  // start day comes out as whole months.
  const after = new Date(Date.UTC(end.year, end.month - 1, end.day + 1));
  const afterYear = after.getUTCFullYear();
  const afterMonth = after.getUTCMonth() + 1;
  const afterDay = after.getUTCDate();

  let months = (afterYear - start.year) * 12 + (afterMonth - start.month);
  if (afterDay < start.day) months -= 1;
  return Math.max(months, 0);
}

/** A period's length as the holder reads it: "12 months", "1 month". */
export function describeLength(period: AppraisalPeriod): string {
  const months = monthsIn(period);
  if (months === 0) return "Under a month";
  return months === 1 ? "1 month" : `${months} months`;
}

/** The periods newest first, which is how the holder looks for one. */
export function newestFirst(periods: AppraisalPeriod[]): AppraisalPeriod[] {
  return [...periods].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
}

/** Whether two values are the same period. Periods have no id of their own. */
export function samePeriod(a: AppraisalPeriod, b: AppraisalPeriod): boolean {
  return a.starts_on === b.starts_on && a.ends_on === b.ends_on;
}
