/**
 * Competencies as the practice tables list them: an id, and the name a
 * person reads. Shared by the member practice panel, which is about one
 * org_unit, and the practice-by-place editor, which is about several.
 */

import { ALL_COMPETENCIES } from "@/types/cbac";

/** One row in a practice table: a competency and its name. */
export interface CompetencyRow {
  id: string;
  name: string;
}

/** What a competency id is called, or the id when it is unknown. */
export function competencyName(id: string): string {
  return ALL_COMPETENCIES.find((entry) => entry.id === id)?.display_name ?? id;
}

/** Rows for *ids*, sorted by name so a long list reads alphabetically. */
export function rowsFor(ids: Iterable<string>): CompetencyRow[] {
  return [...ids]
    .map((id) => ({ id, name: competencyName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
