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

// ---------------------------------------------------------------------------
// Labels and membership, for totalling CPD over the periods
// ---------------------------------------------------------------------------

/**
 * Three-letter month names, for the short labels a select can fit. Held
 * here rather than asked of `Intl`, whose British short form for
 * September is "Sept", which would stand out in a column of three.
 */
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "Oct 2025". */
function shortMonthAndYear(isoDate: string): string {
  const { year, month } = parts(isoDate);
  return `${SHORT_MONTHS[month - 1]} ${year}`;
}

/** "1 Oct 2025". */
function shortDay(isoDate: string): string {
  const { day } = parts(isoDate);
  return `${day} ${shortMonthAndYear(isoDate)}`;
}

const DAY_MONTH_AND_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Midnight UTC on an ISO date, so formatting cannot shift the day. */
function atUtcMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** "1 October 2025". */
export function formatDay(isoDate: string): string {
  return DAY_MONTH_AND_YEAR.format(atUtcMidnight(isoDate));
}

/** A value naming one period, for a select option or a React key. */
export function periodKey(period: AppraisalPeriod): string {
  return `${period.starts_on}_${period.ends_on}`;
}

/**
 * Each period's label, keyed by `periodKey`: the months it starts and
 * ends in, shortened, "Oct 2025 – Sep 2026", with the spaced en dash.
 *
 * Where two periods would read the same, such as two short ones in one
 * month, both are given their full dates instead, so no two options in
 * a list look alike.
 */
export function labelPeriods(periods: AppraisalPeriod[]): Map<string, string> {
  const byMonth = (period: AppraisalPeriod) =>
    `${shortMonthAndYear(period.starts_on)} – ${shortMonthAndYear(period.ends_on)}`;

  const counts = new Map<string, number>();
  for (const period of periods) {
    const label = byMonth(period);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const labels = new Map<string, string>();
  for (const period of periods) {
    const label = byMonth(period);
    labels.set(
      periodKey(period),
      (counts.get(label) ?? 0) > 1
        ? `${shortDay(period.starts_on)} – ${shortDay(period.ends_on)}`
        : label,
    );
  }
  return labels;
}

/** Whether an ISO date falls in a period, both ends included. */
export function periodContains(
  period: AppraisalPeriod,
  isoDate: string,
): boolean {
  return period.starts_on <= isoDate && isoDate <= period.ends_on;
}

/** The June to June year starting in June of `year`. */
function juneToJune(year: number): AppraisalPeriod {
  return { starts_on: `${year}-06-01`, ends_on: `${year + 1}-05-31` };
}

/** The year whose June the June to June year holding `isoDate` began in. */
function juneYearOf(isoDate: string): number {
  const { year, month } = parts(isoDate);
  return month >= 6 ? year : year - 1;
}

/**
 * The June to June years CPD falls back to while no period is declared,
 * newest first: the one holding `today`, back to the one holding
 * `oldest` (the earliest activity), and never fewer than `minimum`.
 */
export function juneToJuneYears(
  today: string,
  oldest?: string,
  minimum = 5,
): AppraisalPeriod[] {
  const newestYear = juneYearOf(today);
  const oldestYear = oldest
    ? Math.min(juneYearOf(oldest), newestYear)
    : newestYear;
  const count = Math.max(minimum, newestYear - oldestYear + 1);

  return Array.from({ length: count }, (_, offset) =>
    juneToJune(newestYear - offset),
  );
}
