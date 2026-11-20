/**
 * The order a typed date is read in, set per jurisdiction in
 * `shared/jurisdiction-config.yaml`.
 *
 * 03/04/2026 is 3 April to a British reader and 4 March to an American
 * one. Reading it the wrong way round gives a wrong date with no error,
 * so the order is named once, here, rather than guessed per field.
 */

import jurisdictionConfig from "@/generated/jurisdiction-config.json";

/** Day, month, year (27/03/2026) or month, day, year (03/27/2026). */
export type DateOrder = "dmy" | "mdy";

const DATE_ORDERS: readonly string[] = ["dmy", "mdy"];

export function isDateOrder(value: unknown): value is DateOrder {
  return typeof value === "string" && DATE_ORDERS.includes(value);
}

/** A jurisdiction's date order, or day first for one not configured. */
export function dateOrderOf(jurisdictionId: string): DateOrder {
  const order = jurisdictionConfig.jurisdictions[jurisdictionId]?.date_order;

  return isDateOrder(order) ? order : "dmy";
}

/** The date order of the jurisdiction this deployment serves. */
export const DEFAULT_DATE_ORDER: DateOrder = dateOrderOf(
  jurisdictionConfig.default_jurisdiction,
);
