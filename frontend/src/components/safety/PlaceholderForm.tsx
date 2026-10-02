/**
 * PlaceholderForm Component
 *
 * One text field per placeholder, labelled by its key, with where it is
 * used as the description. Save hands back every value; cancel hands
 * back nothing. Shaped like the passport forms: `useState` per field and
 * a `canSubmit` guard. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { ButtonPair } from "@/components/button";
import { TextField } from "@components/form";
import type { Placeholder } from "@lib/safety";

export interface PlaceholderFormProps {
  placeholders: Placeholder[];
  /** Called with every placeholder's value, keyed by placeholder key */
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function PlaceholderForm({
  placeholders,
  onSave,
  onCancel,
}: PlaceholderFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(placeholders.map((p) => [p.key, p.value])),
  );

  const canSubmit = placeholders.every(
    (p) => (values[p.key] ?? "").trim().length > 0,
  );

  function save() {
    if (!canSubmit) return;
    onSave(
      Object.fromEntries(
        placeholders.map((p) => [p.key, (values[p.key] ?? "").trim()]),
      ),
    );
  }

  return (
    <BaseCard data-testid="placeholder-form">
      <Stack gap="md">
        {placeholders.map((placeholder) => (
          <TextField
            key={placeholder.key}
            label={`{{ ${placeholder.key} }}`}
            description={`Used in ${placeholder.used_in.join(", ")}.`}
            value={values[placeholder.key] ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setValues((current) => ({
                ...current,
                [placeholder.key]: value,
              }));
            }}
            required
          />
        ))}
        <ButtonPair
          acceptLabel="Save changes"
          acceptDisabled={!canSubmit}
          onAccept={save}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
