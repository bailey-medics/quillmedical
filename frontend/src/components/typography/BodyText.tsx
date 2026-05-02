/**
 * BodyText Component
 *
 * Primary body text component for the application. Renders block-level
 * text at `lg` size with standard body weight (500). Inherits the theme
 * text colour (navy) via `--mantine-color-text`.
 */

import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

export interface BodyTextProps {
  /** Content to render as body text */
  children: ReactNode;
}

/**
 * Renders block-level body text with consistent size and weight.
 *
 * @param props - Component props
 * @returns Text element
 */
export default function BodyText({ children }: BodyTextProps) {
  return (
    <Text size="lg" fw={typographyTokens.fontWeights.body}>
      {children}
    </Text>
  );
}
