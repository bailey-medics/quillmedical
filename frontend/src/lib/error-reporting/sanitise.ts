/**
 * Sanitising client error reports
 *
 * Everything leaving the browser as an error report passes through here first.
 * The strongest rule is that no raw URL from the authenticated app may be
 * recorded, because app paths carry identifiers directly —
 * `/api/patients/{patient_id}/letters`, `/api/users/{user_id}` — and a URL is
 * enough to disclose that a person is being treated for something, without a
 * single clinical field.
 *
 * Messages are kept and redacted rather than dropped. An earlier version kept
 * a message only when the JavaScript engine had composed it, on the grounds
 * that `api.ts` copies server-supplied `detail` strings into `Error.message`.
 * Auditing the backend showed that risk to be real but narrow — seventeen
 * endpoints interpolate a raw exception into `detail`, and every other
 * interpolation is a fixed vocabulary — so it is being fixed at those sites
 * instead. Filtering was the weaker move: it cost most of the diagnostic value
 * to defend against something a filter cannot actually catch, since names have
 * no pattern.
 *
 * What the redaction patterns here do catch is the structured shapes — NHS
 * numbers, dates, postcodes, emails, identifiers and URLs. They are a
 * backstop, not the primary defence. The primary defence is that the backend
 * does not put patient data in an error response in the first place.
 */

/**
 * Longest value retained per field.
 *
 * These must stay at or below the backend schema's limits. `truncate` counts
 * its own marker, so a truncated value never exceeds the figure given here and
 * a long field cannot turn into a rejected request.
 */
const MAX_MESSAGE = 400;
const MAX_STACK = 4000;
const MAX_COMPONENT_STACK = 2000;
const MAX_NAME = 100;
const MAX_ERROR_CODE = 100;
const MAX_RELEASE = 100;
const MAX_ROUTE = 200;

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
const TRUNCATION_MARKER = "…[truncated]";

/**
 * Patterns applied to every free-text field, in order.
 *
 * Ordering matters: URLs go first, because a URL may itself contain an email
 * address or a run of digits that the later rules would otherwise leave
 * stranded in a half-redacted string.
 */
const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Absolute URLs, including any query string.
  [/\bhttps?:\/\/[^\s"'`)<>\]]+/gi, URL_PLACEHOLDER],
  // Email addresses. The repetitions are bounded rather than open-ended:
  // `[\w.+-]+@` backtracks quadratically over a long run of word characters
  // with no `@` in it, which a minified stack trace is exactly made of — 2.8
  // seconds on a 50 KB stack, blocking the main thread while the app is
  // already broken. The bounds are the real limits from RFC 5321 anyway: 64
  // characters for the local part, 63 for a domain label.
  [/[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]{1,63}/g, REDACTED],
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

/**
 * Truncates to `max`, marking that it happened.
 *
 * The marker is counted within `max` rather than added to it, so the result is
 * never longer than the caller asked for. The backend rejects any field over
 * its own limit, and a marker added on top of a client limit set equal to that
 * one would turn an over-long field into a dropped report.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = Math.max(0, max - TRUNCATION_MARKER.length);
  return `${text.slice(0, room)}${TRUNCATION_MARKER}`;
}

/**
 * Sanitises an error message.
 *
 * Redacted, not dropped: the structured shapes go, and multi-segment paths go
 * with them, since an error thrown while handling a route may quote it.
 */
export function sanitiseMessage(message: string): string {
  const withoutPaths = redact(message ?? "").replace(
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
/**
 * Redact a list of code locations without destroying the locations.
 *
 * Shared by both stacks. Only the origin is stripped, since that is the part
 * that could carry a route; the bundle path and the position are what make a
 * frame worth having. `:line:column` is held aside behind a sentinel while the
 * rest is redacted, because minified bundles carry five-figure line numbers
 * and the long-digit-run rule would otherwise replace the one part of a frame
 * that says where the error actually happened.
 */
function redactCodeLocations(text: string): string {
  const withoutOrigins = text.replace(/\bhttps?:\/\/[^\s/]+(?=\/)/gi, "");

  const positions: string[] = [];
  const withPlaceholders = withoutOrigins.replace(
    /:(\d+):(\d+)\b/g,
    (match) => {
      positions.push(match);
      return `${SENTINEL}${positions.length - 1}${SENTINEL}`;
    },
  );

  return redact(withPlaceholders).replace(
    new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, "g"),
    (_, index: string) => positions[Number(index)] ?? "",
  );
}

export function sanitiseStack(stack: string): string {
  return truncate(redactCodeLocations(stack).trim(), MAX_STACK);
}

/**
 * Sanitises a React component stack.
 *
 * Given the same treatment as a JavaScript stack, because it is the same kind
 * of thing: a list of code locations. Running plain redaction over it collapsed
 * every `https://…/index.js:60:65253` to `[url]`, so a production report read
 * `at Boom ([url])` — the name useful, the position gone. That also made the
 * frames unresolvable against a source map, since a position is the only thing
 * a map has to work from.
 */
export function sanitiseComponentStack(componentStack: string): string {
  return truncate(
    redactCodeLocations(componentStack).trim(),
    MAX_COMPONENT_STACK,
  );
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
  return truncate(identifierOnly, MAX_NAME) || "Error";
}

/**
 * Sanitises a backend error code.
 *
 * Codes are a fixed vocabulary the backend chooses — `USER_NOT_FOUND` — so
 * they carry no user data by construction. They are still filtered by
 * character class rather than trusted, for the same reason as the name: a
 * value embedded in a larger token defeats the word-boundary patterns.
 */
/**
 * Sanitises a release identifier.
 *
 * Shape-checked rather than redacted. Running the prose rules over it corrupted
 * the value it exists to carry: a git revision routinely contains a run of five
 * or more digits, which the record-number rule replaces, so a version arrived
 * as `8ff30ad0c83b15f306deab[redacted]e1be[redacted]b0a` — and differently
 * mangled each release, which defeats the entire point of recording which build
 * a fault came from.
 *
 * A version is letters, digits and separators: a revision, a tag, a semantic
 * version. Anything outside that is dropped. This is a weaker guarantee than
 * the other fields get, and deliberately so — the risk here is a caller putting
 * their own noise in their own version field, not a disclosure, and certain
 * corruption is worse than a hypothetical.
 */
export function sanitiseRelease(release: string): string {
  const value = (release ?? "").replace(/[^A-Za-z0-9._-]/g, "");
  // A full git revision passes untouched; everything else is still redacted.
  // The exact length is what makes this safe: an NHS number is ten digits and
  // therefore valid hex, so a looser "looks like a revision" rule would let
  // one through here. Forty characters is what `git rev-parse HEAD` and
  // `deploy.yml` both produce, which is why both were made to use the full
  // form rather than the short one.
  if (/^[0-9a-f]{40}$/i.test(value)) return value;
  return truncate(redact(value), MAX_RELEASE);
}

export function sanitiseErrorCode(code: string): string {
  // Redact before filtering, not after. Filtering alone only removes the
  // separators, so `CODE 943 476 5919` collapsed to `CODE9434765919` and
  // carried the NHS number through intact. Digits cannot simply be dropped
  // the way the name field drops them, because real codes contain them —
  // `PRESCRIBE_SCHEDULE_2_DENIED`.
  // Filtering alone only removes the separators, so `CODE 943 476 5919`
  // collapsed to `CODE9434765919` and `CODE_1974-03-02` to `CODE_19740302` —
  // the value intact, merely reformatted. Redacting first does not help
  // either, because the patterns are anchored on word boundaries which do not
  // fire inside a larger token. A run of digits is what actually distinguishes
  // a smuggled value from a real code: those carry a digit or two at most.
  const redacted = redact(code ?? "").replace(/[^A-Za-z0-9_]/g, "");
  return truncate(redacted.replace(/\d{3,}/g, REDACTED), MAX_ERROR_CODE);
}

/**
 * Narrows a status to a real HTTP status code.
 *
 * Anything outside the range, or not a whole number, is dropped rather than
 * clamped — a nonsense status is more likely to mean the property was not what
 * it claimed than to mean a real response.
 */
export function sanitiseStatus(status: unknown): number | undefined {
  if (typeof status !== "number" || !Number.isInteger(status)) return undefined;
  return status >= 100 && status <= 599 ? status : undefined;
}

/**
 * Sanitises a route pattern.
 *
 * The pattern is rebuilt from the router's own params, so an identifier should
 * already have been replaced by the name that captured it. This is the
 * backstop for the cases that escape it — a route reached before the router
 * matched, or a splat whose value did not line up with the path.
 */
export function sanitiseRoute(route: string): string {
  return truncate(redact(route ?? "").trim(), MAX_ROUTE);
}

/** Where an error was caught. */
export type ErrorSource = "boundary" | "window" | "unhandledrejection";

/** Raw input, straight from the browser. */
export type RawErrorReport = {
  name: string;
  message: string;
  stack?: string | undefined;
  componentStack?: string | undefined;
  errorCode?: string | undefined;
  status?: number | undefined;
  release: string;
  source: ErrorSource;
};

/** What is safe to send. */
export type SanitisedErrorReport = {
  name: string;
  message: string;
  stack: string;
  componentStack: string;
  errorCode: string;
  status: number | undefined;
  release: string;
  source: ErrorSource;
};

/**
 * Properties read off a thrown value, and the complete list of them.
 *
 * `api.ts` attaches `error_code`, `status` and — on some responses — `email`
 * to the errors it raises. The email is a real address belonging to a real
 * person, so this reads properties by name and never enumerates them. Anything
 * `api.ts` gains later is excluded until someone adds it here deliberately.
 */
export function fromError(
  error: unknown,
  release: string,
  source: ErrorSource,
  componentStack?: string,
): RawErrorReport {
  const e = (error ?? {}) as Record<string, unknown>;

  return {
    name: typeof e["name"] === "string" ? e["name"] : "Error",
    message: typeof e["message"] === "string" ? e["message"] : "",
    stack: typeof e["stack"] === "string" ? e["stack"] : undefined,
    componentStack,
    errorCode:
      typeof e["error_code"] === "string" ? e["error_code"] : undefined,
    status: typeof e["status"] === "number" ? e["status"] : undefined,
    release,
    source,
  };
}

/**
 * Reduces a raw browser error to the fixed, sanitised shape that may leave
 * the browser. Nothing reaches the network without passing through this.
 */
export function sanitiseErrorReport(
  input: RawErrorReport,
): SanitisedErrorReport {
  return {
    name: sanitiseName(input.name),
    message: sanitiseMessage(input.message ?? ""),
    stack: sanitiseStack(input.stack ?? ""),
    componentStack: sanitiseComponentStack(input.componentStack ?? ""),
    errorCode: sanitiseErrorCode(input.errorCode ?? ""),
    status: sanitiseStatus(input.status),
    release: sanitiseRelease(input.release ?? ""),
    source: input.source,
  };
}
