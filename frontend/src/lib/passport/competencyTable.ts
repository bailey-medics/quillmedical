/**
 * The rows of a framework's competency table, for the By competency view
 * of the passport. Drawn by `CompetencyFrameworkTable`.
 *
 * **Every item in the framework is a row**, whether or not the holder has
 * anything against it yet, in the order the framework's file lists them.
 */

import { frameworkItems } from "./frameworks";
import type { CompetencyState, ScopeRef } from "./types";

/**
 * Where a row's sign-off stands.
 *
 * `not_asked` covers two things the index reports differently: a
 * competency with no entry at all, and one with evidence but no sign-off,
 * which `_entry` in `backend/app/features/passport/index.py` gives as
 * `requested` with no `sign_off` behind it.
 */
export type Standing = "signed_off" | "requested" | "not_asked";

/** One row of the table. */
export interface CompetencyTableRow {
  key: string;
  id: string;
  name: string;
  scope: ScopeRef | null;
  standing: Standing;
  logbookEntries: number;
}

/** Strongest first, for a row made from several entries. */
const STANDING_ORDER: Standing[] = ["signed_off", "requested", "not_asked"];

/**
 * Where one index entry stands.
 *
 * A declined sign-off reads as `not_asked`, as agreed at review: the
 * holder has nothing standing for it, and may ask again. A fourth state
 * for it would be one more branch here. `superseded` is `not_asked` too,
 * because a sign-off corrected by a later one says nothing about where
 * the competency stands now.
 */
export function standingOf(state: CompetencyState): Standing {
  if (state.status === "signed_off") return "signed_off";
  if (state.status === "requested" && state.sign_off) return "requested";

  return "not_asked";
}

/**
 * The framework's rows, in the order its file lists its items.
 *
 * A competency signed off one scope at a time has an index entry for each
 * scope. **Each scope that is signed off or requested gets a row of its
 * own**, with that scope's logbook count. A scope with nothing asked gets
 * no row, because a Not asked row for every tumour site would bury the
 * ones that matter. When no scope has a sign-off, the competency is one
 * Not asked row, as an unscoped one would be, and its logbook count is
 * the largest any entry reports rather than a sum, because the entries
 * for one competency may count the same procedures.
 */
export function frameworkRows(
  frameworkId: string,
  competencies: CompetencyState[],
): CompetencyTableRow[] {
  const rows: CompetencyTableRow[] = [];

  for (const item of frameworkItems(frameworkId)) {
    const states = competencies.filter((state) => state.id === item.id);
    const scopedWithSignOff = states.filter(
      (state) => state.scope && standingOf(state) !== "not_asked",
    );

    if (scopedWithSignOff.length > 0) {
      for (const state of scopedWithSignOff) {
        rows.push({
          key: `${item.id}:${state.scope?.id ?? ""}`,
          id: item.id,
          name: item.display_name,
          scope: state.scope ?? null,
          standing: standingOf(state),
          logbookEntries: state.logbook_entries,
        });
      }
      continue;
    }

    const standings = states.map(standingOf);
    const standing =
      STANDING_ORDER.find((each) => standings.includes(each)) ?? "not_asked";

    rows.push({
      key: item.id,
      id: item.id,
      name: item.display_name,
      scope: null,
      standing,
      logbookEntries: Math.max(
        0,
        ...states.map((state) => state.logbook_entries),
      ),
    });
  }

  return rows;
}

/** "12 entries", "1 entry", or a dash for none. */
export function logbookLabel(count: number): string {
  if (count === 0) return "-";

  return count === 1 ? "1 entry" : `${count} entries`;
}
