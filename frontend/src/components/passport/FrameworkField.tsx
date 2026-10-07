/**
 * FrameworkField Component
 *
 * Chooses the frameworks somebody works to: the published documents
 * their competencies are signed off against, such as a national
 * curriculum or their own hospital's sign-off sheet.
 *
 * **Typing finds a framework by its name or its publisher**, and the
 * specialty above narrows the list to one specialty. Quill will hold many
 * frameworks for many specialties, so nobody should have to read them
 * all to find theirs.
 *
 * **A framework filed under no specialty is always listed**, since it
 * belongs to every one: general clinical skills are everybody's.
 *
 * **What is already chosen stays in the list whatever the filter says.**
 * Narrowing to one specialty must not make a choice from another vanish
 * from the field, where it would look as though it had been removed.
 *
 * @example
 * ```tsx
 * <FrameworkField
 *   options={useFrameworkChoices(true)}
 *   value={frameworks}
 *   onChange={setFrameworks}
 * />
 * ```
 */

import { useMemo, useState } from "react";
import { Stack } from "@mantine/core";
import { MultiSelectField, SelectField } from "@components/form";
import {
  SPECIALTY_FILTER_OPTIONS,
  filedUnder,
  type FrameworkOption,
} from "@lib/passport/frameworks";

export interface FrameworkFieldProps {
  /** The frameworks to offer, in the order to offer them */
  options: FrameworkOption[];
  /** The chosen framework ids */
  value: string[];
  /** Called with the new list of ids */
  onChange: (value: string[]) => void;
  /** Field label */
  label?: string;
  /** Helper text below the field */
  description?: string;
  /** Validation message */
  error?: string;
  /** Marks the field as needing an answer */
  required?: boolean;
  /** Disables both the field and its filter */
  disabled?: boolean;
}

/** A framework as one line: its name, then who published which edition. */
function optionLabel(framework: FrameworkOption): string {
  return `${framework.name} (${framework.publisher}, ${framework.version})`;
}

export default function FrameworkField({
  options,
  value,
  onChange,
  label = "Frameworks you work to",
  description,
  error,
  required = false,
  disabled = false,
}: FrameworkFieldProps) {
  const [specialty, setSpecialty] = useState<string | null>(null);

  const data = useMemo(() => {
    const offered = new Set(options.map((option) => option.id));
    return [
      ...options
        .filter(
          (option) =>
            value.includes(option.id) || filedUnder(option, specialty),
        )
        .map((option) => ({ value: option.id, label: optionLabel(option) })),
      // A framework chosen earlier that Quill no longer holds, kept so it
      // can be seen and removed.
      ...value
        .filter((id) => !offered.has(id))
        .map((id) => ({ value: id, label: `${id} (no longer offered)` })),
    ];
  }, [options, value, specialty]);

  return (
    <Stack gap="md">
      <SelectField
        label="Specialty"
        description="Optional. Narrows the frameworks below to one specialty."
        placeholder="Every specialty"
        data={SPECIALTY_FILTER_OPTIONS.map((option) => ({
          value: option.id,
          label: option.display_name,
        }))}
        value={specialty}
        onChange={setSpecialty}
        clearable
        disabled={disabled}
      />
      <MultiSelectField
        label={label}
        description={description}
        error={error}
        placeholder={value.length === 0 ? "Search frameworks" : undefined}
        data={data}
        value={value}
        onChange={onChange}
        searchable
        nothingFoundMessage="No framework found"
        required={required}
        disabled={disabled}
      />
    </Stack>
  );
}
