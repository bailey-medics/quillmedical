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
 * The scopes a competency declares, in the catalogue's order. Empty where
 * it is assessed as a whole, or is unknown.
 */
export function scopesFor(competencyId: string): ScopeOption[] {
  const catalogue = competenciesData.competencies as CatalogueEntry[];
  const entry = catalogue.find((item) => item.id === competencyId);

  return entry?.scopes?.map(({ id, name }) => ({ id, name })) ?? [];
}
