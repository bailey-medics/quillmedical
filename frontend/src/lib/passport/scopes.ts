/**
 * What a sign-off for a competency may cover, from the frameworks the
 * backend serves.
 *
 * Some competencies are signed off one part of practice at a time: a
 * tumour site, for prescribing chemotherapy. Read from the catalogue for
 * the reason the levels are, because the list is a property of the
 * competency and the same for everybody.
 */

import type { FrameworkCatalogue } from "./catalogue";

/** One thing a sign-off may cover. */
export interface ScopeOption {
  id: string;
  name: string;
}

/**
 * A competency's name with what a record covers after it, as in
 * "Give a course of treatment: Lung".
 *
 * Used wherever a record's competency is named, so two records for the
 * same competency and different scopes never read the same. Unchanged
 * where there is no scope, which is most competencies.
 */
export function nameWithScope(
  name: string,
  scope: { name: string } | null | undefined,
): string {
  return scope ? `${name}: ${scope.name}` : name;
}

/**
 * The scopes a competency declares, in the catalogue's order. Empty where
 * it is assessed as a whole, is unknown, or the catalogue has not loaded
 * yet.
 */
export function scopesFor(
  catalogue: FrameworkCatalogue | null,
  competencyId: string,
): ScopeOption[] {
  const entry = catalogue?.competency(competencyId);

  return entry?.scopes?.map(({ id, name }) => ({ id, name })) ?? [];
}
