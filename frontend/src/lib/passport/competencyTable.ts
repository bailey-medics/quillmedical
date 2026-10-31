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
export type Standing = "signed_off" | "requested" | "declined" | "not_asked";

/** One row of the table. */
export interface CompetencyTableRow {
  key: string;
  id: string;
  name: string;
  scope: ScopeRef | null;
  standing: Standing;
  logbookEntries: number;
}

/** Choices about how rows are made, still to be settled at review. */
export interface CompetencyTableOptions {
  /** Give a declined latest sign-off a state of its own */
  showDeclined?: boolean;
  /** Give each scope of a scoped competency a row of its own */
  rowPerScope?: boolean;
}

/** Strongest first, for a row made from several scopes' entries. */
const STANDING_ORDER: Standing[] = [
  "signed_off",
  "requested",
  "declined",
  "not_asked",
];

/**
 * Where one index entry stands.
 *
 * A declined sign-off is `not_asked` unless `showDeclined` is set: whether
 * a decline earns a state of its own is still to be decided. `superseded`
 * is always `not_asked`, because a sign-off corrected by a later one says
 * nothing about where the competency stands now.
 */
export function standingOf(
  state: CompetencyState,
  showDeclined = false,
): Standing {
  if (state.status === "signed_off") return "signed_off";
  if (state.status === "requested" && state.sign_off) return "requested";
  if (state.status === "declined" && showDeclined) return "declined";

  return "not_asked";
}

/** The strongest of several standings. */
function strongest(standings: Standing[]): Standing {
  return (
    STANDING_ORDER.find((standing) => standings.includes(standing)) ??
    "not_asked"
  );
}

/**
 * The framework's rows, in the order its file lists its items.
 *
 * A competency signed off one scope at a time has an index entry for each
 * scope. By default it is still one row, standing at the strongest of its
 * scopes; `rowPerScope` gives each scope a row instead. The logbook count
 * is the largest any entry reports rather than a sum, because the entries
 * for one competency may count the same procedures.
 */
export function frameworkRows(
  frameworkId: string,
  competencies: CompetencyState[],
  { showDeclined = false, rowPerScope = false }: CompetencyTableOptions = {},
): CompetencyTableRow[] {
  const rows: CompetencyTableRow[] = [];

  for (const item of frameworkItems(frameworkId)) {
    const states = competencies.filter((state) => state.id === item.id);

    if (rowPerScope && states.some((state) => state.scope)) {
      for (const state of states) {
        rows.push({
          key: `${item.id}:${state.scope?.id ?? ""}`,
          id: item.id,
          name: item.display_name,
          scope: state.scope ?? null,
          standing: standingOf(state, showDeclined),
          logbookEntries: state.logbook_entries,
        });
      }
      continue;
    }

    rows.push({
      key: item.id,
      id: item.id,
      name: item.display_name,
      scope: null,
      standing: strongest(
        states.map((state) => standingOf(state, showDeclined)),
      ),
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
