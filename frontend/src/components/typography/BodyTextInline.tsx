/**
 * BodyTextInline Component
 *
 * Inline (`<span>`) variant of body text for use within other text blocks
 * or table cells. Preserves whitespace with `pre-wrap`.
 */

import { Text } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

export interface BodyTextInlineProps {
  /** Content to render inline */
  children: ReactNode;
  /** Optional colour override */
  c?: MantineColor;
  /**
   * Emphasises a word or two inside a sentence. Defaults to false.
   *
   * `BodyTextBold` renders a block, so it cannot carry a name in the
   * middle of a line without breaking the sentence around it.
   */
  bold?: boolean;
  /**
   * Lets a word longer than the line break inside itself. Defaults to
   * false.
   *
   * For a value nobody chose the length of, such as an address or a
   * release id, which would otherwise run off a phone. Not the default:
   * in a table cell it lets the column shrink to a letter wide.
   */
  breakAnywhere?: boolean;
}

/**
 * Renders inline body text as a `<span>` element.
 *
 * @param props - Component props
 * @returns Inline text span
 */
export default function BodyTextInline({
  children,
  c,
  bold = false,
  breakAnywhere = false,
}: BodyTextInlineProps) {
  return (
    <Text
      component="span"
      size="md"
      fw={
        bold
          ? typographyTokens.fontWeights.bold
          : typographyTokens.fontWeights.body
      }
      c={c}
      style={{
        whiteSpace: "pre-wrap",
        ...(breakAnywhere && { overflowWrap: "anywhere" }),
      }}
    >
      {children}
    </Text>
  );
}
