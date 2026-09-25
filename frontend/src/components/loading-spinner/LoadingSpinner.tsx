/**
 * LoadingSpinner Component
 *
 * Mantine's spinner, with the word a screen reader needs. A bare `Loader`
 * is a picture with no text, so while a page waits on it a screen reader
 * user hears nothing at all. This pairs the spinner, hidden from
 * assistive technology, with a visually hidden `role="status"` saying
 * "Loading" (WCAG 4.1.3 Status messages).
 *
 * Use it wherever a spinner stands in for a whole page or panel. Spinners
 * inside a button stay a plain `Loader` with `aria-hidden`, because the
 * button already says what is happening.
 */

import { Box, Loader, VisuallyHidden, type LoaderProps } from "@mantine/core";

export interface LoadingSpinnerProps {
  /** What is loading, read out by screen readers. Defaults to "Loading". */
  label?: string;
  /** Spinner size, as Mantine's `Loader` takes it */
  size?: LoaderProps["size"];
}

export default function LoadingSpinner({
  label = "Loading",
  size,
}: LoadingSpinnerProps) {
  return (
    <Box>
      <Loader size={size} aria-hidden="true" />
      <VisuallyHidden role="status">{label}</VisuallyHidden>
    </Box>
  );
}
