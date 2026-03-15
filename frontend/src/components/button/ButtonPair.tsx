/**
 * ButtonPair Component
 *
 * A paired accept/cancel button group for modals and forms.
 * Provides consistent styling and layout for confirm/dismiss actions.
 *
 * @example
 * ```tsx
 * <ButtonPair
 *   onAccept={handleSave}
 *   onCancel={handleClose}
 * />
 * ```
 */

import { Button, Group } from "@mantine/core";

interface ButtonPairProps {
  /** Label for the accept/confirm button (defaults to "OK") */
  acceptLabel?: string;
  /** Label for the cancel button (defaults to "Cancel") */
  cancelLabel?: string;
  /** Called when the accept button is clicked */
  onAccept: () => void;
  /** Called when the cancel button is clicked */
  onCancel: () => void;
  /** Disables the accept button */
  acceptDisabled?: boolean;
}

export default function ButtonPair({
  acceptLabel = "OK",
  cancelLabel = "Cancel",
  onAccept,
  onCancel,
  acceptDisabled = false,
}: ButtonPairProps) {
  return (
    <Group justify="flex-end" mt="xs">
      <Button variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button onClick={onAccept} disabled={acceptDisabled}>
        {acceptLabel}
      </Button>
    </Group>
  );
}
