/**
 * The rows of a framework's competency table, for the By competency view
 * of the passport. Drawn by `CompetencyFrameworkTable`.
 *
 * **Every item in the framework is a row**, whether or not the holder has
 * anything against it yet, in the order the framework's file lists them.
 */

import type { FrameworkCatalogue } from "./catalogue";
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
  /**
   * What the latest sign-off recorded, where it differs from the
   * framework today, or null where nothing differs or nothing is signed.
   */
  signedAs: SignedAs | null;
}

/**
 * The words and version a sign-off recorded, where the framework has
 * moved on since. Each is null where it matches today's.
 */
export interface SignedAs {
  /** The competency's name as the sign-off recorded it. */
  name: string | null;
  /** The level's name as the sign-off recorded it. */
  level: string | null;
  /** The framework version it was given under, if not the newest. */
  version: number | null;
}

/**
 * What a sign-off recorded that the framework no longer says, or null.
 * Compares the entry's stored words with the catalogue's, so a reworded
 * competency or level is shown both ways rather than silently replaced.
 */
function signedAsFor(
  catalogue: FrameworkCatalogue,
  frameworkId: string,
  currentName: string,
  state: CompetencyState | undefined,
): SignedAs | null {
  if (state === undefined || standingOf(state) === "not_asked") return null;

  const currentLevel = catalogue
    .competency(state.id)
    ?.levels?.find((level) => level.id === state.level?.id);
  const newest = catalogue.frameworkVersion(frameworkId);

  const name = state.name !== currentName ? state.name : null;
  const level =
    state.level && currentLevel && state.level.name !== currentLevel.name
      ? state.level.name
      : null;
  const version =
    state.framework_version != null &&
    newest !== undefined &&
    state.framework_version !== newest
      ? state.framework_version
      : null;

  return name === null && level === null && version === null
    ? null
    : { name, level, version };
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
  catalogue: FrameworkCatalogue,
  frameworkId: string,
  competencies: CompetencyState[],
): CompetencyTableRow[] {
  const rows: CompetencyTableRow[] = [];

  for (const item of catalogue.frameworkItems(frameworkId)) {
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
          signedAs: signedAsFor(
            catalogue,
            frameworkId,
            item.display_name,
            state,
          ),
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
      signedAs: signedAsFor(
        catalogue,
        frameworkId,
        item.display_name,
        states.find((state) => standingOf(state) === standing),
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
