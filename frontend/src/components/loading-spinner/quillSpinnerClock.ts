/**
 * One clock for every quill on the page.
 *
 * A CSS animation starts when its element appears. A wait that passes
 * through several spinners in a row (the router's fallback, then the
 * sign-in check, then a competency check) would therefore show the quill
 * snapping back to face on at each one. Instead each spinner asks here
 * how long the first has been turning, and starts that far in.
 *
 * Times are milliseconds on the document's timeline, which is what a CSS
 * animation's own start time is measured on.
 */

let startedAt = 0;

/**
 * Say when the turn began. Called once, from `main.tsx`, with the moment
 * the spinner in `index.html` started, so React's first spinner carries on
 * from where that one had reached. Without it the turn is counted from
 * when the page opened.
 */
export function startQuillSpinnerClockAt(timelineMs: number): void {
  if (!Number.isFinite(timelineMs) || timelineMs < 0) return;

  startedAt = timelineMs;
}

/**
 * How long the quill has been turning, in whole milliseconds. Zero where
 * there is no timeline to read, which is jsdom, and never negative.
 */
export function quillSpinnerElapsedMs(): number {
  if (typeof document === "undefined") return 0;

  const now = document.timeline?.currentTime;
  if (typeof now !== "number") return 0;

  return Math.max(0, Math.round(now - startedAt));
}

/** For tests: back to counting from when the page opened. */
export function resetQuillSpinnerClock(): void {
  startedAt = 0;
}
