/**
 * A competency's scale, from the frameworks the backend serves.
 *
 * Read from the catalogue rather than the passport, because a holder asks
 * for a competency before anything about it is on their record, and the
 * scale is a property of the competency, the same for everybody.
 */

import type { FrameworkCatalogue } from "./catalogue";

/** One step on a competency's scale. */
export interface LevelOption {
  id: string;
  name: string;
}

/**
 * The levels a competency is signed off against, in the catalogue's order,
 * which is the scale's order. Empty where it has no scale, is unknown, or
 * the catalogue has not loaded yet.
 */
export function levelsFor(
  catalogue: FrameworkCatalogue | null,
  competencyId: string,
): LevelOption[] {
  const entry = catalogue?.competency(competencyId);

  return entry?.levels?.map(({ id, name }) => ({ id, name })) ?? [];
}
