/**
 * What to tell somebody when the server refuses a field.
 *
 * A request with a wrong field is answered 422, and the answer's
 * `detail` is a list: one entry for each thing wrong, saying where it
 * is (`loc`) and what is wrong (`msg`). Every other refusal carries one
 * message. The API client once read only the second kind, found no
 * message in a list, and showed "HTTP 422".
 *
 * The first entry is the one shown. Somebody correcting a form mends
 * one field at a time, and is shown the next when they send it again.
 */

/** Where in a request a fault is. Not a field's name, so not shown. */
const PLACES = new Set(["body", "query", "path", "header", "cookie"]);

/** What the server puts in front of a message raised by its own check. */
const VALUE_ERROR = /^Value error, /;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `new_password` as "New password". */
function asWords(field: string): string {
  const words = field.replace(/_/g, " ").trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The name of the field a `loc` points at, or nothing if it names none. */
function fieldOf(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;

  const names = loc.filter(
    (part): part is string => typeof part === "string" && !PLACES.has(part),
  );
  const last = names.at(-1);

  return last ? asWords(last) : null;
}

/**
 * The message for a list of field errors, or null when `detail` is not
 * such a list, so the caller can fall back to what it did before.
 *
 * @example
 * fieldErrorMessage([{ loc: ["body", "email"], msg: "String should have at most 255 characters" }])
 * // "Email: String should have at most 255 characters"
 */
export function fieldErrorMessage(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null;

  const first: unknown = detail[0];
  if (!isRecord(first) || typeof first["msg"] !== "string") return null;

  const what = first["msg"].replace(VALUE_ERROR, "");
  const field = fieldOf(first["loc"]);

  return field ? `${field}: ${what}` : what;
}
