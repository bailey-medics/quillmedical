/**
 * CompetencyPicker Component
 *
 * Chooses a competency from one searchable, alphabetical list.
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
 * />
 * ```
 */

import { useMemo } from "react";
import { SelectField } from "@components/form";
import { ASSESSABLE_COMPETENCIES } from "@/types/cbac";

/** One competency, as the generated catalogue holds it. */
interface CatalogueEntry {
  id: string;
  display_name: string;
}

export interface CompetencyPickerProps {
  /** The chosen competency id, or null */
  value: string | null;
  /** Called with the chosen competency id */
  onChange: (competencyId: string | null) => void;
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
  label = "Competency",
  description,
  error,
  required = false,
  disabled = false,
}: CompetencyPickerProps) {
  const data = useMemo(
    () =>
      // Active and assessable only, matching what the API accepts.
      // Alphabetical, since no other order means anything to a reader.
      (ASSESSABLE_COMPETENCIES as CatalogueEntry[])
        .map((entry) => ({ value: entry.id, label: entry.display_name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );

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
