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

import { Button, Group } from "@mantine/core";

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
  return (
    <Group justify="flex-end">
      {onPrevious && (
        <Button variant="outline" onClick={onPrevious}>
          Previous
        </Button>
      )}
      <Button onClick={onNext} disabled={nextDisabled} loading={nextLoading}>
        {nextLabel}
      </Button>
    </Group>
  );
}
