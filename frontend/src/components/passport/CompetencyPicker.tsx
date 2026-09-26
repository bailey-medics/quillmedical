/**
 * CompetencyPicker Component
 *
 * Chooses a competency from a searchable list, with the holder's
 * specialties' common competencies first.
 *
 * **A specialty orders, it never restricts.** Each chosen specialty's
 * common competencies come first under "Common in <specialty>", in the
 * order its file lists them, and every other assessable competency
 * follows alphabetically under "All competencies". The heading says
 * "common" rather than "required": a list presented as the set that
 * matters becomes a syllabus, which is the sufficiency judgement the
 * passport refuses to make. With no specialty, Generic, there is one
 * flat alphabetical list.
 *
 * **Only competencies somebody can be assessed on.** `manage_users` is a
 * software permission, not a skill, so it is never offered; the API
 * refuses it too. Among the assessable ones nothing is hidden, so
 * somebody signed off on something unusual can still find it.
 *
 * **The catalogue comes from the generated bundle, for now.** There is
 * no endpoint serving competency definitions; `GET
 * /api/passport/competencies` is described in the plan but was never
 * built, so this reads `src/generated/competencies.json` like the admin
 * pages do. The plan already lists replacing that with an endpoint as a
 * deferred item, because every competency ever defined currently ships
 * to every browser.
 *
 * @example
 * ```tsx
 * <CompetencyPicker
 *   value={competencyId}
 *   onChange={setCompetencyId}
 *   specialties={["oncology"]}
 * />
 * ```
 */

import { useMemo } from "react";
import { SelectField } from "@components/form";
import { ASSESSABLE_COMPETENCIES } from "@/types/cbac";
import {
  getPassportSpecialty,
  type PassportSpecialtyDefinition,
} from "@lib/passport/specialties";
import { specialtyGroup } from "./specialtyChoice";

/** One competency, as the generated catalogue holds it. */
interface CatalogueEntry {
  id: string;
  display_name: string;
}

/** The heading everything outside the holder's specialties sits under. */
export const EVERYTHING_ELSE_GROUP = "All competencies";

export interface CompetencyPickerProps {
  /** The chosen competency id, or null */
  value: string | null;
  /** Called with the chosen competency id */
  onChange: (competencyId: string | null) => void;
  /**
   * The holder's specialty ids, in their order. Their common
   * competencies are listed first. Empty or absent is Generic.
   */
  specialties?: string[];
  /** Field label */
  label?: string;
  /** Helper text below the field */
  description?: string;
  /** Validation message */
  error?: string;
  /** Whether a competency must be chosen */
  required?: boolean;
  /** Disables the field */
  disabled?: boolean;
}

export default function CompetencyPicker({
  value,
  onChange,
  specialties = [],
  label = "Competency",
  description,
  error,
  required = false,
  disabled = false,
}: CompetencyPickerProps) {
  // Joined into a string so a new array with the same ids, as a parent
  // re-rendering passes, does not rebuild the list.
  const specialtyKey = specialties.join(",");

  const data = useMemo(() => {
    // Active and assessable only, matching what the API accepts.
    const catalogue = ASSESSABLE_COMPETENCIES as CatalogueEntry[];
    const byId = new Map(catalogue.map((entry) => [entry.id, entry]));
    const toOption = (entry: CatalogueEntry) => ({
      value: entry.id,
      label: entry.display_name,
    });

    // A competency common to two chosen specialties appears once, under
    // the first, since Mantine's select needs every value to be unique.
    const placed = new Set<string>();
    const groups = specialtyKey
      .split(",")
      .map((id) => (id ? getPassportSpecialty(id) : undefined))
      .filter(
        (specialty): specialty is PassportSpecialtyDefinition =>
          specialty !== undefined,
      )
      .map((specialty) => ({
        group: specialtyGroup(specialty.display_name),
        items: specialty.common_competencies
          .filter((id) => !placed.has(id))
          .map((id) => byId.get(id))
          .filter((entry): entry is CatalogueEntry => entry !== undefined)
          .map((entry) => {
            placed.add(entry.id);
            return toOption(entry);
          }),
      }))
      .filter((group) => group.items.length > 0);

    // Alphabetical, since no other order means anything to a reader.
    const rest = catalogue
      .filter((entry) => !placed.has(entry.id))
      .map(toOption)
      .sort((a, b) => a.label.localeCompare(b.label));

    // Generic, or a specialty naming nothing: one flat list reads
    // better than a group of one.
    if (groups.length === 0) return rest;

    return [...groups, { group: EVERYTHING_ELSE_GROUP, items: rest }];
  }, [specialtyKey]);

  return (
    <SelectField
      label={label}
      description={description}
      error={error}
      placeholder="Search competencies"
      data={data}
      value={value}
      onChange={onChange}
      searchable
      nothingFoundMessage="No competency found"
      required={required}
      disabled={disabled}
    />
  );
}
