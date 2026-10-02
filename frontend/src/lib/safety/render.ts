/**
 * Render a safety document's markdown with its case's placeholders.
 *
 * A `{{ key }}` whose key the case does not define is left as it is, as
 * a template tool would leave it, so a missing placeholder is visible
 * rather than silently blank. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import type { Placeholder, SafetyDocument } from "./types";

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function renderDocument(
  document: SafetyDocument,
  placeholders: readonly Placeholder[],
): string {
  const values = new Map(placeholders.map((p) => [p.key, p.value]));
  return document.content.replace(PLACEHOLDER, (whole, key: string) =>
    values.has(key) ? (values.get(key) as string) : whole,
  );
}

/** The placeholder keys a document names, in order of first use. */
export function placeholderKeysIn(document: SafetyDocument): string[] {
  const keys: string[] = [];
  for (const match of document.content.matchAll(PLACEHOLDER)) {
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}
