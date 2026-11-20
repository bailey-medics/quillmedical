/**
 * Reads a date somebody typed, in the order its reader writes dates: day
 * first by default, month first for an American reader. The year is
 * always in full.
 *
 * Mantine's own fallback hands the text to the browser, which reads
 * 03/04/2026 as 4 March and rolls 31/02/2026 into March. A date of birth
 * or a due date read the wrong way round is wrong data, so anything that
 * is not plainly a real date is refused rather than guessed.
 */

import type { DateOrder } from "@lib/dateOrder";

/** What a piece of typed text turned out to be. */
export type ParsedDateInput =
  | { kind: "date"; value: string }
  | { kind: "empty" }
  | { kind: "two-digit-year" }
  | { kind: "invalid" };

const MONTHS: readonly string[] = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const NUMERIC = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d+)$/;
const NAMED = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d+)$/i;
const NAMED_MONTH_FIRST =
  /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d+)$/i;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The month a name or its first three letters stands for, from 1. */
function monthFromName(name: string): number | null {
  const lower = name.toLowerCase();
  if (lower.length < 3) return null;

  const index = MONTHS.findIndex(
    (month) => month === lower || month.slice(0, 3) === lower.slice(0, 3),
  );
  if (index === -1) return null;
  if (lower.length > 3 && MONTHS[index] !== lower && lower !== "sept") {
    return null;
  }

  return index + 1;
}

/** `YYYY-MM-DD` for a day that exists, or null for one that does not. */
function realDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;

  const pad = (n: number): string => String(n).padStart(2, "0");

  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function fromParts(
  day: number,
  month: number,
  yearText: string,
): ParsedDateInput {
  if (yearText.length <= 2) return { kind: "two-digit-year" };
  if (yearText.length !== 4) return { kind: "invalid" };

  const value = realDate(Number(yearText), month, day);

  return value === null ? { kind: "invalid" } : { kind: "date", value };
}

/** A date whose month was written as a word, such as "March". */
function fromNamed(
  dayText: string,
  name: string,
  yearText: string,
): ParsedDateInput {
  const month = monthFromName(name);
  if (month === null) return { kind: "invalid" };

  return fromParts(Number(dayText), month, yearText);
}

export function parseDateInput(
  text: string,
  order: DateOrder = "dmy",
): ParsedDateInput {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };

  const iso = ISO.exec(trimmed);
  if (iso) {
    const value = realDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    return value === null ? { kind: "invalid" } : { kind: "date", value };
  }

  const numeric = NUMERIC.exec(trimmed);
  if (numeric) {
    const [first, second] = [Number(numeric[1]), Number(numeric[2])];

    return order === "mdy"
      ? fromParts(second, first, numeric[3])
      : fromParts(first, second, numeric[3]);
  }

  // A month written as a word cannot be misread, so either side of the
  // day is accepted in both orders.
  const named = NAMED.exec(trimmed);
  if (named) return fromNamed(named[1], named[2], named[3]);

  const monthFirst = NAMED_MONTH_FIRST.exec(trimmed);
  if (monthFirst) return fromNamed(monthFirst[2], monthFirst[1], monthFirst[3]);

  return { kind: "invalid" };
}

/** The message a person sees when what they typed was refused. */
export function dateInputMessage(
  parsed: ParsedDateInput,
  order: DateOrder = "dmy",
): string | null {
  if (parsed.kind === "two-digit-year") {
    return "Enter the year in full, for example 1980";
  }
  if (parsed.kind === "invalid") {
    return order === "mdy"
      ? "Enter a real date as month, day and year, for example 03/27/2026"
      : "Enter a real date as day, month and year, for example 27/03/2026";
  }

  return null;
}
