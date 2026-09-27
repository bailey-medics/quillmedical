/**
 * PassportLeadSpecialtiesCard Component
 *
 * The admin card for an organisation's lead passport specialties: the
 * ones its people see first when they choose their own specialty, so an
 * oncology department can put Oncology at the top.
 *
 * A composition of `ActionCard` and `MultiSelectField`. The order they
 * are picked in is the order they lead; removing one and picking it again
 * moves it to the end. Everything not picked follows alphabetically.
 * Saved as it changes, like the holder's own specialty card, because it
 * only reorders a list: it hides no specialty and chooses none for
 * anybody.
 *
 * A saved lead naming a specialty that is no longer offered is still
 * shown, so an admin can see it and remove it.
 *
 * **Enter never submits a surrounding form.** The features page puts this
 * card inside its form, above the buttons, and Enter in the field would
 * otherwise save the feature switches. Choosing an option with Enter
 * still works: the dropdown handles that before this refusal.
 *
 * @example
 * ```tsx
 * <PassportLeadSpecialtiesCard
 *   options={PASSPORT_SPECIALTIES}
 *   value={leads}
 *   onChange={saveLeads}
 * />
 * ```
 */

import { useMemo } from "react";
import ActionCard from "@/components/action-card";
import { MultiSelectField } from "@components/form";
import { IconFileText } from "@/components/icons/appIcons";
import type { SpecialtyOption } from "@lib/passport/specialties";

export interface PassportLeadSpecialtiesCardProps {
  /** Every specialty an admin can pick, in the order to list them */
  options: SpecialtyOption[];
  /** The lead specialty ids, the first leading */
  value: string[];
  /** Called with the new list, in order */
  onChange: (value: string[]) => void;
  /** True while the saved list is still loading */
  disabled?: boolean;
  /** Why the list could not be loaded or the last change saved */
  error?: string;
}

export default function PassportLeadSpecialtiesCard({
  options,
  value,
  onChange,
  disabled = false,
  error,
}: PassportLeadSpecialtiesCardProps) {
  const data = useMemo(() => {
    const offered = new Set(options.map((option) => option.id));
    return [
      ...options.map((option) => ({
        value: option.id,
        label: option.display_name,
      })),
      // A saved lead whose file has gone, kept so it can be removed
      ...value
        .filter((id) => !offered.has(id))
        .map((id) => ({ value: id, label: `${id} (no longer offered)` })),
    ];
  }, [options, value]);

  return (
    <ActionCard
      icon={<IconFileText />}
      title="Passport specialties"
      fullWidth
      action={
        <MultiSelectField
          label="Lead specialties"
          description={
            "Listed first, in this order, when people here choose their " +
            "specialty. The rest follow alphabetically. Saved as you " +
            "change it."
          }
          placeholder={
            value.length === 0 ? "None: the list is alphabetical" : undefined
          }
          data={data}
          value={value}
          onChange={onChange}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          error={error}
          disabled={disabled}
        />
      }
    />
  );
}
