/**
 * Reads a date somebody typed, the British way: day, then month, then a
 * year in full.
 *
 * Mantine's own fallback hands the text to the browser, which reads
 * 03/04/2026 as 4 March and rolls 31/02/2026 into March. A date of birth
 * or a due date read the wrong way round is wrong data, so anything that
 * is not plainly a real date is refused rather than guessed.
 */

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

export function parseDateInput(text: string): ParsedDateInput {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };

  const iso = ISO.exec(trimmed);
  if (iso) {
    const value = realDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    return value === null ? { kind: "invalid" } : { kind: "date", value };
  }

  const numeric = NUMERIC.exec(trimmed);
  if (numeric) {
    return fromParts(Number(numeric[1]), Number(numeric[2]), numeric[3]);
  }

  const named = NAMED.exec(trimmed);
  if (named) {
    const month = monthFromName(named[2]);
    if (month === null) return { kind: "invalid" };

    return fromParts(Number(named[1]), month, named[3]);
  }

  return { kind: "invalid" };
}

/** The message a person sees when what they typed was refused. */
export function dateInputMessage(parsed: ParsedDateInput): string | null {
  if (parsed.kind === "two-digit-year") {
    return "Enter the year in full, for example 1980";
  }
  if (parsed.kind === "invalid") {
    return "Enter a real date as day, month and year, for example 27/03/2026";
  }

  return null;
}
