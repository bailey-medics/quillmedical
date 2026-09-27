/**
 * A competency's scale, from the shared catalogue.
 *
 * Read from the catalogue rather than the passport, because a holder asks
 * for a competency before anything about it is on their record, and the
 * scale is a property of the competency, the same for everybody.
 */

import competenciesData from "@/generated/competencies.json";

/** One step on a competency's scale. */
export interface LevelOption {
  id: string;
  name: string;
}

interface CatalogueEntry {
  id: string;
  levels?: LevelOption[];
}

/**
 * The levels a competency is signed off against, in the catalogue's order,
 * which is the scale's order. Empty where it has no scale, or is unknown.
 */
export function levelsFor(competencyId: string): LevelOption[] {
  const catalogue = competenciesData.competencies as CatalogueEntry[];
  const entry = catalogue.find((item) => item.id === competencyId);

  return entry?.levels?.map(({ id, name }) => ({ id, name })) ?? [];
}
