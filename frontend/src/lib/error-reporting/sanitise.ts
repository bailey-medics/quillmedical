/**
 * Sanitising client error reports
 *
 * Everything leaving the browser as an error report passes through here
 * first. The plan's strongest rule is that no raw URL from the authenticated
 * app may be recorded, because app paths carry identifiers directly —
 * `/api/patients/{patient_id}/letters`, `/api/users/{user_id}` — and a URL is
 * enough to disclose that a person is being treated for something, without a
 * single clinical field.
 *
 * Messages are treated as untrusted rather than as diagnostic text. `api.ts`
 * copies server-supplied `detail` strings straight into `Error.message`, so a
 * message can carry anything the backend put in a response. Names and free
 * text cannot be pattern-matched out, so messages are kept only for errors the
 * JavaScript engine itself composed, where the wording is generated rather
 * than supplied. Everything else keeps its error type and loses its message.
 *
 * That is deliberately lossy. The purpose here is "where are things going
 * wrong", and the error type, the component stack and the frequency carry most
 * of that; the message is a bonus that is not worth a disclosure.
 */

/** Longest message, stack and component stack retained. */
const MAX_MESSAGE = 300;
const MAX_STACK = 4000;
const MAX_COMPONENT_STACK = 2000;

/**
 * Marker used to hold a stack position aside while the rest is redacted.
 *
 * A private-use code point, so it cannot occur in a real stack trace and is
 * not a control character, which regular expression linting rightly objects
 * to.
 */
const SENTINEL = "\uE000";

const REDACTED = "[redacted]";
const URL_PLACEHOLDER = "[url]";
const PATH_PLACEHOLDER = "[path]";

/**
 * Errors whose messages the JavaScript engine composes itself.
 *
 * These wordings come from the runtime, not from application or server code,
 * so they cannot contain user or patient data. Anything else — including
 * every error `api.ts` raises from a server response — loses its message.
 */
const ENGINE_ERRORS: ReadonlySet<string> = new Set([
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "EvalError",
  "URIError",
]);

/**
 * Patterns applied to every field, in order.
 *
 * Ordering matters: URLs go first, because a URL may itself contain an email
 * address or a run of digits that the later rules would otherwise leave
 * stranded in a half-redacted string.
 */
const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Absolute URLs, including any query string.
  [/\bhttps?:\/\/[^\s"'`)<>\]]+/gi, URL_PLACEHOLDER],
  // Email addresses.
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED],
  // UUIDs, which is what most identifiers here look like.
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    REDACTED,
  ],
  // NHS numbers: ten digits, conventionally grouped 3-3-4.
  [/\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g, REDACTED],
  // ISO dates, which a date of birth usually arrives as.
  [/\b\d{4}-\d{2}-\d{2}\b/g, REDACTED],
  // Day-first dates, which is how a date of birth is usually typed.
  [/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, REDACTED],
  // UK postcodes.
  [/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, REDACTED],
  // Any remaining long run of digits: record numbers, phone numbers, ids.
  [/\d{5,}/g, REDACTED],
];

/** Applies every redaction pattern to a string. */
function redact(text: string): string {
  return REDACTIONS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

/** Truncates to `max`, marking that it happened. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated]`;
}

/**
 * Sanitises an error message.
 *
 * Returns an empty string for anything the engine did not compose, rather
 * than attempting to scrub prose that may contain a name.
 */
export function sanitiseMessage(name: string, message: string): string {
  if (!ENGINE_ERRORS.has(name)) return "";

  // Multi-segment paths go too. A message from the engine will not contain a
  // route, but an engine error thrown while handling one might quote it.
  const withoutPaths = redact(message).replace(
    /(?:\/[\w.~%-]+){2,}/g,
    PATH_PLACEHOLDER,
  );

  return truncate(withoutPaths.trim(), MAX_MESSAGE);
}

/**
 * Sanitises a stack trace.
 *
 * Unlike a message, a stack is a list of code locations, so the bundle paths
 * are worth keeping — they are what makes a report actionable. Only the
 * origin is stripped, since that is the part that could carry a route.
 */
export function sanitiseStack(stack: string): string {
  const withoutOrigins = stack.replace(/\bhttps?:\/\/[^\s/]+(?=\/)/gi, "");

  // Protect `:line:column` before redacting. Minified bundles carry
  // five-figure line numbers, which the long-digit-run rule would otherwise
  // replace — taking with it the one part of a frame that says where the
  // error actually happened.
  const positions: string[] = [];
  const withPlaceholders = withoutOrigins.replace(
    /:(\d+):(\d+)\b/g,
    (match) => {
      positions.push(match);
      return `${SENTINEL}${positions.length - 1}${SENTINEL}`;
    },
  );

  const restored = redact(withPlaceholders).replace(
    new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, "g"),
    (_, index: string) => positions[Number(index)] ?? "",
  );

  return truncate(restored.trim(), MAX_STACK);
}

/** Sanitises a React component stack, which is a list of component names. */
export function sanitiseComponentStack(componentStack: string): string {
  return truncate(redact(componentStack).trim(), MAX_COMPONENT_STACK);
}

/**
 * Sanitises an error name.
 *
 * A name is an identifier — `TypeError`, `ApiError` — not prose, so it is
 * filtered by character class rather than by the redaction patterns. Those
 * patterns are anchored on word boundaries, which do not fire when a value is
 * embedded inside a larger token: `Type` + a postcode + `Error` has no
 * boundary for the postcode rule to catch. Dropping everything that is not a
 * letter removes digits, spaces and punctuation outright, so no NHS number,
 * date, postcode, email or identifier can survive in this field whatever it
 * arrives looking like.
 */
export function sanitiseName(name: string): string {
  const identifierOnly = (name ?? "").replace(/[^A-Za-z_$]/g, "");
  return truncate(identifierOnly, 100) || "Error";
}

/** Where an error was caught. */
export type ErrorSource = "boundary" | "window" | "unhandledrejection";

/** Raw input, straight from the browser. */
export type RawErrorReport = {
  name: string;
  message: string;
  stack?: string | undefined;
  componentStack?: string | undefined;
  release: string;
  source: ErrorSource;
};

/** What is safe to send. */
export type SanitisedErrorReport = {
  name: string;
  message: string;
  stack: string;
  componentStack: string;
  release: string;
  source: ErrorSource;
};

/**
 * Reduces a raw browser error to the fixed, sanitised shape that may leave
 * the browser. Nothing reaches the network without passing through this.
 */
export function sanitiseErrorReport(
  input: RawErrorReport,
): SanitisedErrorReport {
  const name = sanitiseName(input.name);

  return {
    name,
    message: sanitiseMessage(name, input.message ?? ""),
    stack: sanitiseStack(input.stack ?? ""),
    componentStack: sanitiseComponentStack(input.componentStack ?? ""),
    release: truncate(redact(input.release ?? "").trim(), 100),
    source: input.source,
  };
}
