/**
 * What a sign-off for a competency may cover, from the shared catalogue.
 *
 * Some competencies are signed off one part of practice at a time: a
 * tumour site, for prescribing chemotherapy. Read from the catalogue for
 * the reason the levels are, because the list is a property of the
 * competency and the same for everybody.
 */

import competenciesData from "@/generated/competencies.json";

/** One thing a sign-off may cover. */
export interface ScopeOption {
  id: string;
  name: string;
}

interface CatalogueEntry {
  id: string;
  scopes?: ScopeOption[];
}

/**
 * A competency's name with what a record covers after it, as in
 * "Review and prescribe systemic anti-cancer therapy: Lung".
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
 * it is assessed as a whole, or is unknown.
 */
export function scopesFor(competencyId: string): ScopeOption[] {
  const catalogue = competenciesData.competencies as CatalogueEntry[];
  const entry = catalogue.find((item) => item.id === competencyId);

  return entry?.scopes?.map(({ id, name }) => ({ id, name })) ?? [];
}
