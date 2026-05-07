/**
 * ButtonPairRed Component
 *
 * A paired action/cancel button group where the action button is red.
 * Used for destructive or warning confirmation dialogues (e.g. unsaved changes).
 *
 * @example
 * ```tsx
 * <ButtonPairRed
 *   onAccept={handleLeave}
 *   onCancel={handleStay}
 *   acceptLabel="Leave page"
 *   cancelLabel="Stay on page"
 * />
 * ```
 */

import { Button, Group, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

interface ButtonPairRedProps {
  /** Label for the destructive action button (defaults to "OK") */
  acceptLabel?: string;
  /** Label for the cancel button (defaults to "Cancel") */
  cancelLabel?: string;
  /** Called when the accept button is clicked */
  onAccept: () => void;
  /** Called when the cancel button is clicked */
  onCancel: () => void;
  /** Disables the accept button */
  acceptDisabled?: boolean;
  /** Shows loading spinner on the accept button */
  acceptLoading?: boolean;
  /** HTML button type for the accept button (defaults to "button") */
  acceptType?: "button" | "submit";
}

export default function ButtonPairRed({
  acceptLabel = "OK",
  cancelLabel = "Cancel",
  onAccept,
  onCancel,
  acceptDisabled = false,
  acceptLoading = false,
  acceptType = "button",
}: ButtonPairRedProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const buttonSize = isMobile ? "md" : "lg";
  const fontSize = isMobile
    ? "var(--mantine-font-size-md)"
    : "var(--mantine-font-size-lg)";

  return (
    <Group justify="flex-end" mt="xs">
      <Button
        variant="outline"
        onClick={onCancel}
        size={buttonSize}
        styles={{ label: { fontSize } }}
      >
        {cancelLabel}
      </Button>
      <Button
        type={acceptType}
        color="var(--alert-color)"
        onClick={onAccept}
        disabled={acceptDisabled}
        loading={acceptLoading}
        size={buttonSize}
        styles={{ label: { fontSize } }}
      >
        {acceptLabel}
      </Button>
    </Group>
  );
}
