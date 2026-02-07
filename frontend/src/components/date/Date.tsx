/**
 * Date Component
 *
 * Formats and displays dates with internationalisation support.
 * Accepts ISO 8601 date strings (YYYY-MM-DD) from the backend (FHIR format).
 */

import { Text, type TextProps } from "@mantine/core";

type FormattedDateProps = TextProps & {
  /** ISO 8601 date string (YYYY-MM-DD) from backend */
  date: string;
  /** Locale for date formatting. Defaults to 'en-GB' (British English) */
  locale?: "en-GB" | "en-US";
  /** Date format style */
  format?: "short" | "medium" | "long" | "full";
};

/**
 * FormattedDate
 *
 * Displays a formatted date with locale-specific formatting.
 *
 * @example
 * // British format: 12/05/1980
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
  locale = "en-GB",
  format = "short",
  ...textProps
}: FormattedDateProps) {
  if (!date) {
    return null;
  }

  try {
    const dateObj = new globalThis.Date(date);

    // Check if date is valid
    if (Number.isNaN(dateObj.getTime())) {
      return <Text {...textProps}>Invalid date</Text>;
    }

    const formatOptions: Intl.DateTimeFormatOptions =
      format === "short"
        ? {
            year: "numeric",
            month: "numeric",
            day: "numeric",
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

    const formattedDate = new Intl.DateTimeFormat(locale, formatOptions).format(
      dateObj,
    );

    return <Text {...textProps}>{formattedDate}</Text>;
  } catch (error) {
    console.error("Error formatting date:", error);
    return <Text {...textProps}>Invalid date</Text>;
  }
}
