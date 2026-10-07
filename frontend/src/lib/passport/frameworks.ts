/**
 * The frameworks a holder may work to, from `shared/competency-definitions/`.
 *
 * A framework is one published document as a set of competencies: a
 * national curriculum, or one hospital's own sign-off sheet. A holder
 * chooses the ones they work to, and the passport offers them what those
 * contain. That is a limit and not an ordering, which is the difference
 * from the specialty it replaced: a specialty put some competencies first
 * in one long list, and a framework decides what is in the list at all.
 *
 * Read from the generated bundle, so a page can show the choice at once.
 * The backend decides the order to offer them in, with an organisation's
 * lead frameworks first: see `useFrameworkChoices`.
 */

import specialtiesData from "@/generated/specialties.json";
import {
  ALL_COMPETENCIES,
  ALL_FRAMEWORKS,
  ASSESSABLE_COMPETENCIES,
  type Competency,
} from "@/types/cbac";

/** One framework somebody may choose. */
export interface FrameworkOption {
  id: string;
  name: string;
  publisher: string;
  version: string;
  /** The specialties it is filed under. Empty where it belongs to all. */
  specialties: string[];
}

/** One specialty a list of frameworks can be narrowed to. */
export interface SpecialtyFilterOption {
  id: string;
  display_name: string;
}

/** Every framework, alphabetically by name. */
export const FRAMEWORK_OPTIONS: FrameworkOption[] = ALL_FRAMEWORKS.map(
  ({ id, name, publisher, version, specialties }) => ({
    id,
    name,
    publisher,
    version,
    specialties,
  }),
).sort((a, b) => a.name.localeCompare(b.name));

/** Every specialty a framework may be filed under. */
export const SPECIALTY_FILTER_OPTIONS: SpecialtyFilterOption[] =
  specialtiesData.specialties;

/** The framework with this id, or undefined where Quill holds none. */
export function getFramework(id: string): FrameworkOption | undefined {
  return FRAMEWORK_OPTIONS.find((framework) => framework.id === id);
}

/**
 * A framework's items, in the order its file lists them: the active
 * competencies somebody can be assessed on. Empty for an unknown one.
 */
export function frameworkItems(frameworkId: string): Competency[] {
  return ASSESSABLE_COMPETENCIES.filter(
    (competency) => competency.framework_id === frameworkId,
  );
}

/**
 * The framework a competency belongs to, or undefined: for a competency
 * since retired from every framework, or one Quill no longer knows.
 */
export function frameworkOf(competencyId: string): FrameworkOption | undefined {
  const competency = ALL_COMPETENCIES.find(
    (entry) => entry.id === competencyId,
  );
  return competency?.framework_id
    ? getFramework(competency.framework_id)
    : undefined;
}

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
