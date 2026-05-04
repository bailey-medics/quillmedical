/**
 * EmptyState Component
 *
 * Light grey text for empty-state hints and placeholder labels.
 * Uses `gray.4` from the grey design scale.
 */

import { Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Placeholder hint content */
  children: ReactNode;
}

/**
 * Renders placeholder text in `gray.4` at `lg` size.
 *
 * @param props - Component props
 * @returns Light grey text element
 */
export default function EmptyState({ children }: EmptyStateProps) {
  return (
    <Text size="lg" c="var(--mantine-color-placeholder)">
      {children}
    </Text>
  );
}
