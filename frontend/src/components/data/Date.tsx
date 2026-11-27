/**
 * Date Component
 *
 * Pure formatter - returns bare text with no wrapping element.
 * Accepts ISO 8601 date strings (YYYY-MM-DD) from the backend (FHIR format).
 */

import {
  DATE_LOCALE,
  formatInDateOrder,
  type DateLocale,
} from "@lib/dateFormat";

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC on a plain date's day, or null for a day that does not exist. */
function plainDateToUtc(parts: RegExpExecArray): globalThis.Date | null {
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const result = new globalThis.Date(globalThis.Date.UTC(year, month - 1, day));

  const exists =
    result.getUTCFullYear() === year &&
    result.getUTCMonth() === month - 1 &&
    result.getUTCDate() === day;

  return exists ? result : null;
}

type FormattedDateProps = {
  /** ISO 8601 date (YYYY-MM-DD) or timestamp from the backend */
  date: string;
  /**
   * Locale for date formatting. Defaults to this deployment's, from
   * `date_order` in the jurisdiction config.
   */
  locale?: DateLocale;
  /** Date format style */
  format?: "short" | "medium" | "long" | "full";
};

/**
 * FormattedDate
 *
 * Displays a formatted date with locale-specific formatting.
 *
 * @example
 * // In this deployment's order, such as 12/05/1980
 * <FormattedDate date="1980-05-12" />
 *
 * @example
 * // American format: 5/12/1980
 * <FormattedDate date="1980-05-12" locale="en-US" />
 *
 * @example
 * // Long format: 12 May 1980
 * <FormattedDate date="1980-05-12" format="long" />
 */
export default function FormattedDate({
  date,
  locale = DATE_LOCALE,
  format = "short",
}: FormattedDateProps) {
  if (!date) {
    return null;
  }

  /* eslint-disable react-hooks/error-boundaries -- try/catch guards date parsing, not React rendering */
  try {
    // A plain date names a day, not a moment. The browser reads
    // "2026-05-06" as midnight UTC, which is 5 May anywhere west of UTC,
    // and rolls "2026-02-30" into March. So a plain date is checked to
    // exist and shown in UTC; a timestamp is shown where the reader is.
    const plainDate = PLAIN_DATE.exec(date);
    const dateObj = plainDate
      ? plainDateToUtc(plainDate)
      : new globalThis.Date(date);

    if (dateObj === null || Number.isNaN(dateObj.getTime())) {
      return <>Invalid date</>;
    }

    const formatOptions: Intl.DateTimeFormatOptions =
      format === "short"
        ? {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }
        : format === "medium"
          ? {
              year: "numeric",
              month: "short",
              day: "numeric",
            }
          : format === "long"
            ? {
                year: "numeric",
                month: "long",
                day: "numeric",
              }
            : {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              };

    const formattedDate = formatInDateOrder(
      dateObj,
      { ...formatOptions, ...(plainDate && { timeZone: "UTC" }) },
      locale,
    );

    return <>{formattedDate}</>;
  } catch (error) {
    console.error("Error formatting date:", error);
    return <>Invalid date</>;
  }
  /* eslint-enable react-hooks/error-boundaries */
}
