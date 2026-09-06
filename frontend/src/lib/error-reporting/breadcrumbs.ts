/**
 * The trail leading up to an error
 *
 * A report says what broke. Breadcrumbs say what the user had just done, which
 * is usually the difference between a report you can act on and one you can
 * only count.
 *
 * This is deliberately not the usual implementation. Error tooling normally
 * records DOM interactions, console output and network bodies, and that is
 * where most of the reported leaks in this class of product come from: a
 * keystroke trail through a patient search box is patient data, however it is
 * labelled. Here the recordable events are an allowlist of three, each with a
 * fixed set of fields and no free text anywhere. Nothing can be recorded that
 * is not one of them, so there is no path by which a value typed into the
 * interface reaches this buffer.
 */

/** Matches the server's cap. Twenty is enough to see a sequence. */
const MAX_BREADCRUMBS = 20;

/** The server rejects an age beyond this, so it is clamped rather than sent. */
const MAX_AGE_MS = 86_400_000;

/** Longest pattern kept, matching the server's own bound. */
const MAX_PATTERN = 200;

/** The HTTP methods the server will accept on a breadcrumb. */
const METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
type Method = (typeof METHODS)[number];

/** The authentication transitions worth recording. */
export type AuthEvent = "login" | "logout" | "refresh" | "expired";

export type Breadcrumb =
  | { type: "route"; ms: number; pattern: string }
  | {
      type: "api";
      ms: number;
      method: Method;
      pattern: string;
      status: number;
    }
  | { type: "auth"; ms: number; event: AuthEvent };

const buffer: Breadcrumb[] = [];

/** Milliseconds since this page load, bounded to what the server accepts. */
function age(): number {
  try {
    const now = Math.round(performance.now());
    if (!Number.isFinite(now) || now < 0) return 0;
    return Math.min(now, MAX_AGE_MS);
  } catch {
    return 0;
  }
}

function push(crumb: Breadcrumb): void {
  buffer.push(crumb);
  // A ring buffer rather than a growing list: the events just before the
  // error are the ones that explain it, and an unbounded trail on a page left
  // open all day is a memory leak with no diagnostic value.
  while (buffer.length > MAX_BREADCRUMBS) buffer.shift();
}

/**
 * Reduce an API path to a pattern.
 *
 * By allowlist, not by recognising identifiers. A segment is kept only if it
 * is lowercase letters and hyphens — which is what every static segment of
 * this API looks like — and anything else becomes `:id`. Written this way
 * round because identifiers are precisely the thing with no reliable shape:
 * a rule that tries to spot them has to anticipate every form they take,
 * whereas a rule that spots ordinary words fails safe when it meets something
 * new.
 */
export function normaliseApiPath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? "";
  return withoutQuery
    .split("/")
    .map((segment) =>
      segment === "" || /^[a-z][a-z-]*$/.test(segment) ? segment : ":id",
    )
    .join("/")
    .slice(0, MAX_PATTERN);
}

/** Record a navigation, as the matched pattern. */
export function recordRoute(pattern: string): void {
  push({ type: "route", ms: age(), pattern: pattern.slice(0, MAX_PATTERN) });
}

/** Record an API call: what was asked for, and what came back. */
export function recordApi(method: string, path: string, status: number): void {
  const upper = method.toUpperCase();
  if (!(METHODS as readonly string[]).includes(upper)) return;
  if (!Number.isInteger(status) || status < 100 || status > 599) return;
  push({
    type: "api",
    ms: age(),
    method: upper as Method,
    pattern: normaliseApiPath(path),
    status,
  });
}

/** Record an authentication transition. */
export function recordAuth(event: AuthEvent): void {
  push({ type: "auth", ms: age(), event });
}

/** The trail as it stands, oldest first. A copy, so callers cannot edit it. */
export function getBreadcrumbs(): Breadcrumb[] {
  return [...buffer];
}

/** Empty the buffer. For tests, not for application code. */
export function resetBreadcrumbsForTests(): void {
  buffer.length = 0;
}
