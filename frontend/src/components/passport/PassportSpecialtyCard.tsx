/**
 * PassportSpecialtyCard Component
 *
 * The settings card for a passport holder, titled "Clinician passport":
 * their specialties, and the way to their CPD date ranges.
 *
 * A composition of `ActionCard`, `SpecialtyField` and `ActionCardButton`.
 * `ActionCard`'s `action` slot replaces its button, so the field and the
 * button share that slot in a `Stack`. Only rendered for somebody who has
 * a passport; the settings page decides that.
 *
 * **The button stays enabled on a read-only passport**, because the page
 * it opens still shows the ranges, and says why they cannot be changed.
 *
 * **Changing it never leaves the question unanswered.** Clearing every
 * choice in the field is ignored rather than saved, because "no answer"
 * is not something a passport can hold. Generic is the way to have no
 * specialty order.
 *
 * @example
 * ```tsx
 * <PassportSpecialtyCard
 *   options={useSpecialtyChoices(true)}
 *   value={specialties}
 *   onChange={saveSpecialties}
 *   disabled={!canWrite}
 * />
 * ```
 */

import { Stack } from "@mantine/core";
import ActionCard from "@/components/action-card";
import ActionCardButton from "@/components/button/ActionCardButton";
import { IconEPassport } from "@/components/icons/appIcons";
import type { SpecialtyOption } from "@lib/passport/specialties";
import SpecialtyField from "./SpecialtyField";

export interface PassportSpecialtyCardProps {
  /** The specialties to offer, in order; Generic is added last */
  options: SpecialtyOption[];
  /** The holder's specialty ids; `[]` is Generic */
  value: string[];
  /** Called with a new answer, never with an unanswered one */
  onChange: (value: string[]) => void;
  /** True while the passport is read-only, as after an entitlement ends */
  disabled?: boolean;
  /** Why the last change was not saved */
  error?: string;
}

export default function PassportSpecialtyCard({
  options,
  value,
  onChange,
  disabled = false,
  error,
}: PassportSpecialtyCardProps) {
  return (
    <ActionCard
      icon={<IconEPassport />}
      title="Clinician passport"
      action={
        <Stack gap="md">
          <SpecialtyField
            options={options}
            label="Specialities"
            // Only while it cannot be changed, to say why. Otherwise the
            // label says enough, and the card stays slim.
            description={
              disabled
                ? "Your passport is read-only at the moment, so this cannot be changed."
                : undefined
            }
            value={value}
            onChange={(next) => {
              if (next !== null) onChange(next);
            }}
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
