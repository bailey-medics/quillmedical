/**
 * The frameworks a holder may work to: the shape a page reads.
 *
 * A framework is one published document as a set of competencies: a
 * national curriculum, or one hospital's own sign-off sheet. A holder
 * chooses the ones they work to, and the passport offers them what those
 * contain. That is a limit and not an ordering, which is the difference
 * from the specialty it replaced: a specialty put some competencies first
 * in one long list, and a framework decides what is in the list at all.
 *
 * The frameworks themselves come from the backend, through
 * `useFrameworkCatalogue` in `./catalogue`, which gives them in this
 * shape. The backend also decides the order to offer them in, with an
 * organisation's lead frameworks first: see `useFrameworkChoices`.
 */

import specialtiesData from "@/generated/specialties.json";

/** One framework somebody may choose. */
export interface FrameworkOption {
  id: string;
  name: string;
  publisher: string;
  /** The specialties it is filed under. Empty where it belongs to all. */
  specialties: string[];
}

/** One specialty a list of frameworks can be narrowed to. */
export interface SpecialtyFilterOption {
  id: string;
  display_name: string;
}

/** Every specialty a framework may be filed under. */
export const SPECIALTY_FILTER_OPTIONS: SpecialtyFilterOption[] =
  specialtiesData.specialties;

/**
 * Whether a specialty filter keeps a framework. One filed under no
 * specialty belongs to every one, as general clinical skills do, so no
 * filter removes it. Mirrors `_filed_under` in the backend's
 * `features/passport/frameworks.py`.
 */
export function filedUnder(
  framework: Pick<FrameworkOption, "specialties">,
  specialty: string | null,
): boolean {
  if (specialty === null) return true;
  return (
    framework.specialties.length === 0 ||
    framework.specialties.includes(specialty)
  );
}
