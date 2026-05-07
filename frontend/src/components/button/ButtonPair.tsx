/**
 * ButtonPair Component
 *
 * A paired accept/cancel button group for modals and forms.
 * Provides consistent styling and layout for confirm/dismiss actions.
 *
 * When `acceptChildren` is provided, it replaces the accept button label,
 * allowing custom content (e.g. a spinner + text grid swap) while keeping
 * the same sizing and layout.
 *
 * Uses aria-disabled instead of native disabled so the button stays
 * focusable for screen readers and renders with a faded appearance
 * rather than Mantine's default grey.
 *
 * @example
 * ```tsx
 * <ButtonPair
 *   onAccept={handleSave}
 *   onCancel={handleClose}
 * />
 * ```
 */

import type { ReactNode } from "react";
import { Button, Group, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

interface ButtonPairProps {
  /** Label for the accept/confirm button (defaults to "OK") */
  acceptLabel?: string;
  /** Label for the cancel button (defaults to "Cancel") */
  cancelLabel?: string;
  /** Called when the accept button is clicked */
  onAccept?: () => void;
  /** Called when the cancel button is clicked — cancel button hidden when omitted */
  onCancel?: () => void;
  /** Disables the accept button (aria-disabled, stays focusable) */
  acceptDisabled?: boolean;
  /** Shows loading spinner on the accept button (hides label) */
  acceptLoading?: boolean;
  /** HTML button type for the accept button (defaults to "button") */
  acceptType?: "button" | "submit";
  /** Custom content for the accept button, overrides acceptLabel */
  acceptChildren?: ReactNode;
  /** data-testid for the accept button */
  acceptTestId?: string;
}

export default function ButtonPair({
  acceptLabel = "OK",
  cancelLabel = "Cancel",
  onAccept,
  onCancel,
  acceptDisabled = false,
  acceptLoading = false,
  acceptType = "button",
  acceptChildren,
  acceptTestId,
}: ButtonPairProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const buttonSize = isMobile ? "md" : "lg";
  const fontSize = isMobile
    ? "var(--mantine-font-size-md)"
    : "var(--mantine-font-size-lg)";

  return (
    <Group justify="flex-end" mt="xs">
      {onCancel && (
        <Button
          variant="outline"
          onClick={onCancel}
          size={buttonSize}
          styles={{ label: { fontSize } }}
        >
          {cancelLabel}
        </Button>
      )}
      <Button
        type={acceptType}
        onClick={
          acceptDisabled
            ? (e: React.MouseEvent) => e.preventDefault()
            : onAccept
        }
        loading={acceptLoading}
        aria-disabled={acceptDisabled || undefined}
        size={buttonSize}
        styles={{
          root: acceptDisabled
            ? { opacity: 0.6, cursor: "not-allowed" }
            : undefined,
          label: { fontSize },
        }}
        data-testid={acceptTestId}
      >
        {acceptChildren ?? acceptLabel}
      </Button>
    </Group>
  );
}
