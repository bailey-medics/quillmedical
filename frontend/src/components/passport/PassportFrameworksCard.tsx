/**
 * PassportFrameworksCard Component
 *
 * The settings card for a passport holder, titled "Clinician passport":
 * the frameworks they work to, and the way to their CPD date ranges.
 *
 * A composition of `ActionCard`, `FrameworkField` and `ActionCardButton`.
 * `ActionCard`'s `action` slot replaces its button, so the field and the
 * button share that slot in a `Stack`. Only rendered for somebody who has
 * a passport; the settings page decides that.
 *
 * **The frameworks decide what the passport offers.** A holder is offered
 * the competencies in their frameworks and no others, so this is where
 * somebody who cannot find a competency comes to add the framework it
 * belongs to.
 *
 * **Dropping a framework removes nothing already recorded**, and the
 * card says so, because that is the first thing somebody about to remove
 * one will worry about.
 *
 * **The button stays enabled on a read-only passport**, because the page
 * it opens still shows the ranges, and says why they cannot be changed.
 *
 * @example
 * ```tsx
 * <PassportFrameworksCard
 *   options={useFrameworkChoices(true)}
 *   value={frameworks}
 *   onChange={saveFrameworks}
 *   disabled={!canWrite}
 * />
 * ```
 */

import { Stack } from "@mantine/core";
import ActionCard from "@/components/action-card";
import ActionCardButton from "@/components/button/ActionCardButton";
import { IconEPassport } from "@/components/icons/appIcons";
import type { FrameworkOption } from "@lib/passport/frameworks";
import FrameworkField from "./FrameworkField";

export interface PassportFrameworksCardProps {
  /** The frameworks to offer, in the order to offer them */
  options: FrameworkOption[];
  /** The holder's framework ids */
  value: string[];
  /** Called with the new list of ids */
  onChange: (value: string[]) => void;
  /** True while the passport is read-only, as after an entitlement ends */
  disabled?: boolean;
  /** Why the last change was not saved */
  error?: string;
}

export default function PassportFrameworksCard({
  options,
  value,
  onChange,
  disabled = false,
  error,
}: PassportFrameworksCardProps) {
  return (
    <ActionCard
      icon={<IconEPassport />}
      title="Clinician passport"
      action={
        <Stack gap="md">
          <FrameworkField
            options={options}
            description={
              disabled
                ? "Your passport is read-only at the moment, so this cannot be changed."
                : "Your passport offers the competencies in these. Removing one keeps everything already recorded under it."
            }
            value={value}
            onChange={onChange}
            error={error}
            disabled={disabled}
          />
          <ActionCardButton
            label="CPD date ranges"
            url="/settings/cpd-date-ranges"
          />
        </Stack>
      }
    />
  );
}
