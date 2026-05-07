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

import { Button, Group, Loader, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

interface ButtonPairRedProps {
  /** Label for the destructive action button (defaults to "OK") */
  acceptLabel?: string;
  /** Label shown during loading state (defaults to acceptLabel) */
  submittingLabel?: string;
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
  /** Horizontal alignment of the button group (defaults to "flex-end") */
  justify?: "flex-end" | "center";
}

export default function ButtonPairRed({
  acceptLabel = "OK",
  submittingLabel,
  cancelLabel = "Cancel",
  onAccept,
  onCancel,
  acceptDisabled = false,
  acceptLoading = false,
  acceptType = "button",
  justify = "flex-end",
}: ButtonPairRedProps) {
  const loadingLabel = submittingLabel ?? acceptLabel;
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const buttonSize = isMobile ? "md" : "lg";
  const fontSize = isMobile
    ? "var(--mantine-font-size-md)"
    : "var(--mantine-font-size-lg)";

  return (
    <Group justify={justify} mt="xs">
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
        onClick={
          acceptDisabled
            ? (e: React.MouseEvent) => e.preventDefault()
            : onAccept
        }
        aria-disabled={acceptDisabled || undefined}
        size={buttonSize}
        styles={{
          root: {
            backgroundColor: "var(--alert-color)",
            "&:hover": { backgroundColor: "var(--alert-color)" },
            ...(acceptDisabled ? { opacity: 0.6, cursor: "not-allowed" } : {}),
          },
          label: { fontSize },
        }}
      >
        <span style={{ display: "grid", placeItems: "center" }}>
          <span
            style={{
              gridArea: "1/1",
              visibility: acceptLoading ? "hidden" : "visible",
            }}
          >
            {acceptLabel}
          </span>
          <span
            style={{
              gridArea: "1/1",
              visibility: acceptLoading ? "visible" : "hidden",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Loader size="xs" color="white" aria-hidden="true" />
            {loadingLabel}
          </span>
        </span>
      </Button>
    </Group>
  );
}
