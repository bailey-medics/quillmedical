/**
 * Dates shown to a reader, in the order their jurisdiction reads them.
 *
 * `dateOrder.ts` sets how a typed date is read; this sets how a date is
 * shown, from the same `date_order` in `shared/jurisdiction-config.yaml`.
 * So a reader who types 03/27/2026 also sees "March 27, 2026" in a list,
 * never a British date beside an American field.
 *
 * Every date shown in the app goes through `formatInDateOrder`. Each caller
 * keeps its own style (a long month, a time, a weekday), and only the
 * locale comes from here. `dateFormat.test.ts` fails if a locale is
 * named anywhere else.
 */

import { DEFAULT_DATE_ORDER, type DateOrder } from "@lib/dateOrder";

/** The locale that writes dates in each order. */
export type DateLocale = "en-GB" | "en-US";

const LOCALE_FOR_ORDER: Record<DateOrder, DateLocale> = {
  dmy: "en-GB",
  mdy: "en-US",
};

/** The locale that writes dates in the given order. */
export function dateLocaleFor(order: DateOrder): DateLocale {
  return LOCALE_FOR_ORDER[order];
}

/** The locale this deployment shows dates in. */
export const DATE_LOCALE: DateLocale = dateLocaleFor(DEFAULT_DATE_ORDER);

/**
 * A date, or a date and time, in this deployment's order.
 *
 * The options say which parts to show, as for `toLocaleString`: give
 * only date parts for a date, and add `hour` and `minute` for a time.
 */
export function formatInDateOrder(
  value: Date,
  options: Intl.DateTimeFormatOptions,
  locale: DateLocale = DATE_LOCALE,
): string {
  return value.toLocaleString(locale, options);
}
