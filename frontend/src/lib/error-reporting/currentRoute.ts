/**
 * Which screen the user was on
 *
 * A report that says a `TypeError` happened is much less useful than one that
 * says it happened on `/patients/:id`. Without source maps a minified stack
 * names a line of a bundle, so the route is often the most legible thing in
 * the whole report.
 *
 * It is the **matched pattern**, never the resolved URL. `/patients/abc123`
 * discloses that a particular record was open; `/patients/:id` says which
 * screen broke and nothing about whose data was on it. The pattern is rebuilt
 * from the router's own params rather than pattern-matched out of the path, so
 * removing the identifier is structural rather than a filter that has to
 * anticipate what an identifier looks like.
 *
 * Held in a module variable rather than passed as a prop, because the two
 * callers that need it cannot receive one: an error boundary is a class
 * component outside the hook world, and the window listeners have no React
 * context at all.
 */

let current = "";

/** Record the pattern for the screen now showing. */
export function setCurrentRoute(pattern: string): void {
  current = pattern;
}

/** The pattern for the screen now showing, or "" before the first render. */
export function getCurrentRoute(): string {
  return current;
}

/** Reset between tests. Not for application code. */
export function resetCurrentRouteForTests(): void {
  current = "";
}

/**
 * Rebuild the route pattern from a resolved path and the router's params.
 *
 * React Router does not hand out the pattern that matched, but it does hand
 * out the values it captured, and replacing each value with its name gives the
 * pattern back. Working from the captured values means an identifier is
 * removed because the router said it was one — not because it looked like one.
 */
export function toRoutePattern(
  pathname: string,
  params: Readonly<Record<string, string | undefined>>,
): string {
  const captured = Object.entries(params).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].length > 0,
  );

  // A splat can span several segments, so it is replaced whole and first.
  let path = pathname;
  for (const [key, value] of captured) {
    if (key === "*" && path.endsWith(value)) {
      path = `${path.slice(0, path.length - value.length)}:splat`;
    }
  }

  const nameByValue = new Map(
    captured.filter(([key]) => key !== "*").map(([key, value]) => [value, key]),
  );

  return path
    .split("/")
    .map((segment) => {
      const name = nameByValue.get(segment);
      return name === undefined ? segment : `:${name}`;
    })
    .join("/");
}
