/**
 * SpecialtyField Component
 *
 * Chooses the passport holder's specialties, or Generic.
 *
 * **It orders, and nothing else.** A specialty moves its common
 * competencies to the top of the competency picker. It hides nothing and
 * requires nothing, so the helper text says so rather than letting the
 * choice feel like enrolling on a programme.
 *
 * **Three states, not two.** `null` means not yet answered, `[]` means
 * Generic and a list of ids means those specialties. Keeping "not
 * answered" apart from Generic lets a form refuse to go on until the
 * question has actually been answered, so Generic is a choice somebody
 * made rather than a default they missed.
 *
 * **Generic and a specialty contradict each other**, so choosing one
 * clears the other.
 *
 * @example
 * ```tsx
 * <SpecialtyField value={specialties} onChange={setSpecialties} required />
 * ```
 */

import { useMemo } from "react";
import { MultiSelectField } from "@components/form";
import { PASSPORT_SPECIALTIES } from "@lib/passport/specialties";
import {
  GENERIC_CHOICE,
  GENERIC_LABEL,
  nextSpecialtyValue,
} from "./specialtyChoice";

export interface SpecialtyFieldProps {
  /** `null` until answered, `[]` for Generic, or the chosen ids */
  value: string[] | null;
  /** Called with the new answer, in the same three states */
  onChange: (value: string[] | null) => void;
  /** Field label */
  label?: string;
  /** Helper text below the field */
  description?: string;
  /** Validation message */
  error?: string;
  /** Marks the field as needing an answer */
  required?: boolean;
  /** Disables the field */
  disabled?: boolean;
}

export default function SpecialtyField({
  value,
  onChange,
  label = "Your specialty",
  description = "This only changes the order competencies are listed in. " +
    "Everything stays available, and you can change it later in settings.",
  error,
  required = false,
  disabled = false,
}: SpecialtyFieldProps) {
  const data = useMemo(
    () => [
      ...PASSPORT_SPECIALTIES.map((specialty) => ({
        value: specialty.id,
        label: specialty.display_name,
      })),
      { value: GENERIC_CHOICE, label: GENERIC_LABEL },
    ],
    [],
  );

  // The select shows Generic as a pill of its own, so an empty answer
  // and "not answered yet" look different on screen too.
  const selected =
    value === null ? [] : value.length === 0 ? [GENERIC_CHOICE] : value;

  return (
    <MultiSelectField
      label={label}
      description={description}
      error={error}
      placeholder={selected.length === 0 ? "Choose a specialty" : undefined}
      data={data}
      value={selected}
      onChange={(next) => onChange(nextSpecialtyValue(value, next))}
      required={required}
      disabled={disabled}
    />
  );
}
