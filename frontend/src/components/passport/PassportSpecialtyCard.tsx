/**
 * PassportSpecialtyCard Component
 *
 * The settings card for changing a passport holder's specialties.
 *
 * A composition of `ActionCard` and `SpecialtyField`: the card says what
 * a specialty does, and the field changes it. Only rendered for somebody
 * who has a passport; the settings page decides that.
 *
 * **Changing it never leaves the question unanswered.** Clearing every
 * choice in the field is ignored rather than saved, because "no answer"
 * is not something a passport can hold. Generic is the way to have no
 * specialty order.
 *
 * @example
 * ```tsx
 * <PassportSpecialtyCard
 *   value={specialties}
 *   onChange={saveSpecialties}
 *   disabled={!canWrite}
 * />
 * ```
 */

import ActionCard from "@/components/action-card";
import { IconFileText } from "@/components/icons/appIcons";
import SpecialtyField from "./SpecialtyField";

export interface PassportSpecialtyCardProps {
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
  value,
  onChange,
  disabled = false,
  error,
}: PassportSpecialtyCardProps) {
  return (
    <ActionCard
      icon={<IconFileText />}
      title="Passport specialty"
      subtitle={
        "Your specialty's common competencies are listed first when you " +
        "log a procedure or ask for a sign-off. Nothing is hidden."
      }
      action={
        <SpecialtyField
          label="Specialty"
          description={
            disabled
              ? "Your passport is read-only at the moment, so this cannot be changed."
              : "This only changes the order competencies are listed in."
          }
          value={value}
          onChange={(next) => {
            if (next !== null) onChange(next);
          }}
          error={error}
          disabled={disabled}
        />
      }
    />
  );
}
