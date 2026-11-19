/**
 * FieldDescription Component
 *
 * Secondary description text for form fields. Renders at body text size
 * and weight in the theme's `dimmed` colour to indicate supplementary
 * information below field labels.
 */

import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

export interface FieldDescriptionProps {
  /** Description content */
  children: ReactNode;
}

// A block-level span rather than a paragraph: Mantine puts a field's
// description inside its own <p>, and a <p> cannot hold another.
export default function FieldDescription({ children }: FieldDescriptionProps) {
  return (
    <Text
      component="span"
      display="block"
      size="md"
      fw={typographyTokens.fontWeights.body}
      c="dimmed"
    >
      {children}
    </Text>
  );
}
