/**
 * Whether the left and right arrow keys are already spoken for by
 * whatever has focus.
 *
 * A lesson moves between slides on those keys, wherever on the page
 * they are pressed. But a video uses them to skip back and forward, and
 * somewhere text is typed uses them to move the cursor. Pressed there,
 * they belong to that, and must not also change the slide.
 */

/** Things that use the arrow keys themselves. */
const USES_ARROW_KEYS = [
  "video",
  "audio",
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='slider']",
].join(", ");

/**
 * True when a key press came from inside something that uses the arrow
 * keys itself.
 *
 * @param target - The `target` of the key event.
 */
export function arrowKeysAreSpokenFor(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return target.closest(USES_ARROW_KEYS) !== null;
}
