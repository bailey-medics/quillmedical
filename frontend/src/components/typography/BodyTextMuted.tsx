/**
 * BodyTextMuted Component
 *
 * Dimmed variant of body text for secondary or de-emphasised content.
 * Uses the same size and weight as BodyText but with Mantine's `dimmed` colour.
 */

import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

interface BodyTextMutedProps {
  /** Content to render in dimmed body text */
  children: ReactNode;
}

/**
 * Renders dimmed body text at `lg` size with standard body weight.
 *
 * @param props - Component props
 * @returns Dimmed text element
 */
export default function BodyTextMuted({ children }: BodyTextMutedProps) {
  return (
    <Text size="lg" fw={typographyTokens.fontWeights.body} c="dimmed">
      {children}
    </Text>
  );
}
