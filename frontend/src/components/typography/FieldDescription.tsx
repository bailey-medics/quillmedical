/**
 * FieldDescription Component
 *
 * Secondary description text for form fields. Renders at body text size
 * and weight in a moderate grey to indicate supplementary information
 * below field labels.
 */

import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

export interface FieldDescriptionProps {
  /** Description content */
  children: ReactNode;
}

export default function FieldDescription({ children }: FieldDescriptionProps) {
  return (
    <Text size="lg" fw={typographyTokens.fontWeights.body} c="gray.6">
      {children}
    </Text>
  );
}
