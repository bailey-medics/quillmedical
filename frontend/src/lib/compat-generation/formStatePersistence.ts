/**
 * formStatePersistence
 *
 * Best-effort snapshot/restore of in-progress form input so a forced
 * `location.reload()` (see ForcedReloadGate) does not silently discard a
 * half-written clinical note. Deliberately generic and limited in scope:
 *
 * - Only covers native `<input>` (text-like types) and `<textarea>`
 *   elements — custom Mantine controls (Select, RichTextEditor, etc.)
 *   that don't expose a plain native value are not covered.
 * - Restore is exact-match only: a saved field is restored only if an
 *   element with the exact same `name` (or, failing that, `id`) exists
 *   after reload on the same pathname. Anything that doesn't match
 *   exactly is silently dropped, never guessed at.
 */

const STORAGE_PREFIX = "quill-forced-reload-form-state:";

const TEXT_FIELD_SELECTOR =
  "input[type='text'], input[type='email'], input[type='tel'], " +
  "input[type='number'], input[type='search'], input:not([type]), textarea";

function fieldKey(field: HTMLInputElement | HTMLTextAreaElement): string {
  return field.name || field.id;
}

/** Snapshots current native text field values to sessionStorage, keyed by pathname. */
export function persistFormState(pathname: string): void {
  const fields = document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >(TEXT_FIELD_SELECTOR);
  const snapshot: Record<string, string> = {};
  fields.forEach((field) => {
    const key = fieldKey(field);
    if (!key || !field.value) return;
    snapshot[key] = field.value;
  });

  if (Object.keys(snapshot).length === 0) return;

  try {
    sessionStorage.setItem(STORAGE_PREFIX + pathname, JSON.stringify(snapshot));
  } catch {
    // sessionStorage unavailable/full — best-effort only, never blocks reload.
  }
}

/**
 * Restores a previously-saved snapshot for `pathname`, if any, and clears
 * it afterwards (one-shot restore). Sets the value via the native property
 * setter and dispatches a bubbling `input` event so React's controlled
 * inputs (which install their own onChange listeners) pick up the change.
 */
export function restoreFormState(pathname: string): void {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STORAGE_PREFIX + pathname);
  } catch {
    return;
  }
  if (!raw) return;

  try {
    sessionStorage.removeItem(STORAGE_PREFIX + pathname);
  } catch {
    /* ignore */
  }

  let snapshot: Record<string, string>;
  try {
    snapshot = JSON.parse(raw) as Record<string, string>;
  } catch {
    return;
  }

  for (const [key, value] of Object.entries(snapshot)) {
    const field = findFieldByKey(key);
    if (!field) continue; // no exact match — drop this field, never guess.
    setNativeValue(field, value);
  }
}

function findFieldByKey(
  key: string,
): HTMLInputElement | HTMLTextAreaElement | null {
  const byName = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${CSS.escape(key)}"]`,
  );
  if (byName) return byName;

  const byId = document.getElementById(key);
  if (byId instanceof HTMLInputElement || byId instanceof HTMLTextAreaElement) {
    return byId;
  }
  return null;
}

function setNativeValue(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
