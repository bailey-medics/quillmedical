/**
 * PassportLeadFrameworksCard Component
 *
 * The card on an organisation's features page where an admin names its
 * lead frameworks: the ones its people are offered first when they
 * choose the frameworks they work to.
 *
 * **It orders a list and chooses nothing.** Nobody is given a framework
 * by this, and none is hidden: the rest follow alphabetically. An
 * oncology department puts its own sign-off sheet at the top so a new
 * registrar does not have to hunt for it.
 *
 * **The order chosen is the order offered**, so the first one picked
 * leads.
 *
 * **A saved lead whose file has gone is still shown**, marked as no
 * longer offered, so an admin sees what is saved and can remove it.
 *
 * @example
 * ```tsx
 * <PassportLeadFrameworksCard
 *   options={FRAMEWORK_OPTIONS}
 *   value={leads}
 *   onChange={saveLeads}
 * />
 * ```
 */

import { useMemo } from "react";
import ActionCard from "@/components/action-card";
import { MultiSelectField } from "@components/form";
import { IconFileText } from "@/components/icons/appIcons";
import type { FrameworkOption } from "@lib/passport/frameworks";

export interface PassportLeadFrameworksCardProps {
  /** Every framework an admin can pick, in the order to list them */
  options: FrameworkOption[];
  /** The lead framework ids, the first leading */
  value: string[];
  /** Called with the new list, in order */
  onChange: (value: string[]) => void;
  /** True while the saved list is still loading */
  disabled?: boolean;
  /** Why the list could not be loaded or the last change saved */
  error?: string;
}

export default function PassportLeadFrameworksCard({
  options,
  value,
  onChange,
  disabled = false,
  error,
}: PassportLeadFrameworksCardProps) {
  const data = useMemo(() => {
    const offered = new Set(options.map((option) => option.id));
    return [
      ...options.map((option) => ({
        value: option.id,
        label: `${option.name} (${option.publisher}, ${option.version})`,
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
      title="Passport frameworks"
      fullWidth
      action={
        <MultiSelectField
          label="Lead frameworks"
          description={
            "Offered first, in this order, when people here choose the " +
            "frameworks they work to. The rest follow alphabetically. " +
            "Saved as you change it."
          }
          placeholder={
            value.length === 0 ? "None: the list is alphabetical" : undefined
          }
          data={data}
          value={value}
          onChange={onChange}
          searchable
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
