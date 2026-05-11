/**
 * BodyText Component
 *
 * Primary body text component for the application. Renders block-level
 * text at `md` size (16px mobile → 19px desktop) with standard body
 * weight (500). Matches NHS/GOV.UK typography recommendations.
 * Inherits the theme text colour (navy) via `--mantine-color-text`.
 */

import { Text } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

export interface BodyTextProps {
  /** Content to render as body text */
  children: ReactNode;
  /** Optional colour override */
  c?: MantineColor;
  /** Text alignment. Defaults to "left". */
  justify?: "left" | "centre" | "right";
}

const alignMap = {
  left: "left",
  centre: "center",
  right: "right",
} as const;

/**
 * Renders block-level body text with consistent size and weight.
 *
 * @param props - Component props
 * @returns Text element
 */
export default function BodyText({
  children,
  c,
  justify = "left",
}: BodyTextProps) {
  return (
    <Text
      size={typographyTokens.sizes.desktop}
      fw={typographyTokens.fontWeights.body}
      c={c}
      ta={alignMap[justify]}
    >
      {children}
    </Text>
  );
}
