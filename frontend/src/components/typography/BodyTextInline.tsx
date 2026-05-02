/**
 * BodyTextInline Component
 *
 * Inline (`<span>`) variant of body text for use within other text blocks
 * or table cells. Preserves whitespace with `pre-wrap`.
 */

import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

interface BodyTextInlineProps {
  /** Content to render inline */
  children: ReactNode;
}

/**
 * Renders inline body text as a `<span>` element.
 *
 * @param props - Component props
 * @returns Inline text span
 */
export default function BodyTextInline({ children }: BodyTextInlineProps) {
  return (
    <Text
      component="span"
      size="lg"
      fw={typographyTokens.fontWeights.body}
      style={{ whiteSpace: "pre-wrap" }}
    >
      {children}
    </Text>
  );
}
