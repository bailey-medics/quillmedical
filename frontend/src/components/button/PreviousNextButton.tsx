/**
 * PreviousNextButton Component
 *
 * A right-aligned button pair for step-by-step navigation (e.g. assessments).
 * Shows Previous (outline) and Next/Submit (filled) buttons.
 * Previous is hidden when `onPrevious` is not provided.
 *
 * @example
 * ```tsx
 * <PreviousNextButton
 *   onPrevious={goBack}
 *   onNext={goForward}
 *   nextDisabled={!hasSelection}
 * />
 * ```
 */

import { Button, Group, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

interface PreviousNextButtonProps {
  /** Called when Previous is clicked (hidden when undefined) */
  onPrevious?: () => void;
  /** Called when the forward button is clicked */
  onNext: () => void;
  /** Label for the forward button (defaults to "Next") */
  nextLabel?: string;
  /** Disables the forward button */
  nextDisabled?: boolean;
  /** Shows a loading spinner on the forward button */
  nextLoading?: boolean;
}

export default function PreviousNextButton({
  onPrevious,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  nextLoading = false,
}: PreviousNextButtonProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const buttonSize = isMobile ? "md" : "lg";
  const fontSize = isMobile
    ? "var(--mantine-font-size-md)"
    : "var(--mantine-font-size-lg)";

  return (
    <Group justify="flex-end">
      {onPrevious && (
        <Button
          variant="outline"
          onClick={onPrevious}
          size={buttonSize}
          styles={{ label: { fontSize } }}
        >
          Previous
        </Button>
      )}
      <Button
        onClick={
          nextDisabled ? (e: React.MouseEvent) => e.preventDefault() : onNext
        }
        loading={nextLoading}
        aria-disabled={nextDisabled || undefined}
        size={buttonSize}
        styles={{
          root: nextDisabled
            ? { opacity: 0.6, cursor: "not-allowed" }
            : undefined,
          label: { fontSize },
        }}
      >
        {nextLabel}
      </Button>
    </Group>
  );
}
