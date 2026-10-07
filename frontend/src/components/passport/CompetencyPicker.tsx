/**
 * CompetencyPicker Component
 *
 * Chooses a competency from the frameworks the holder works to.
 *
 * **A framework limits, where a specialty only ordered.** The list holds
 * the competencies in the holder's own frameworks, each framework under
 * its own name and in the order its document gives them, and nothing
 * else. Quill holds many frameworks for many specialties, several of them
 * describing the same act in their own words, so one list of every
 * competency could not be read. Somebody who wants one that is not here
 * adds the framework it belongs to, in Settings.
 *
 * **With no framework chosen there is nothing to pick**, and the field
 * says where to choose one. It does not fall back to listing everything:
 * that would be the long list coming back by a side door.
 *
 * **No heading says "required".** A framework's items are listed, never
 * counted or ticked off: how much is enough is the assessor's judgement.
 *
 * **Only competencies somebody can be assessed on.** A framework's file
 * may hold permissions beside its skills, and those are never offered.
 *
 * @example
 * ```tsx
 * <CompetencyPicker
 *   value={competencyId}
 *   onChange={setCompetencyId}
 *   frameworks={["oncology"]}
 * />
 * ```
 */

import { useMemo } from "react";
import { SelectField } from "@components/form";
import { frameworkItems, getFramework } from "@lib/passport/frameworks";

/** What the field says when the holder works to no framework yet. */
export const NO_FRAMEWORKS_MESSAGE =
  "Choose the frameworks you work to in Settings, then pick from their competencies here.";

export interface CompetencyPickerProps {
  /** The chosen competency id, or null */
  value: string | null;
  /** Called with the chosen competency id */
  onChange: (competencyId: string | null) => void;
  /**
   * The ids of the frameworks the holder works to, in their order. Only
   * their competencies are listed. Empty or absent lists nothing.
   */
  frameworks?: string[];
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
  frameworks = [],
  label = "Competency",
  description,
  error,
  required = false,
  disabled = false,
}: CompetencyPickerProps) {
  // Joined into a string so a new array with the same ids, as a parent
  // re-rendering passes, does not rebuild the list.
  const frameworkKey = frameworks.join(",");

  const data = useMemo(() => {
    // A competency belongs to one framework, since its file is its
    // framework, so no value can appear under two headings.
    return frameworkKey
      .split(",")
      .filter((id) => id !== "")
      .map((id) => ({
        // A framework Quill no longer holds has no items, and is dropped
        // below with the others that list nothing.
        group: getFramework(id)?.name ?? id,
        items: frameworkItems(id).map((competency) => ({
          value: competency.id,
          label: competency.display_name,
        })),
      }))
      .filter((group) => group.items.length > 0);
  }, [frameworkKey]);

  const nothingToPick = data.length === 0;

  return (
    <SelectField
      label={label}
      description={nothingToPick ? NO_FRAMEWORKS_MESSAGE : description}
      error={error}
      placeholder={
        nothingToPick ? "No frameworks chosen" : "Search competencies"
      }
      data={data}
      value={value}
      onChange={onChange}
      searchable
      nothingFoundMessage="No competency found in your frameworks"
      required={required}
      disabled={disabled || nothingToPick}
    />
  );
}
