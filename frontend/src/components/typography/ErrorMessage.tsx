/**
 * ErrorMessage Component
 *
 * Validation and error message text with an alert icon.
 * Uses `orange.8` for colour-blind accessibility (avoids red/green ambiguity).
 */

import { Box, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { IconAlertCircle } from "@/components/icons/appIcons";

export interface ErrorMessageProps {
  /** Error message content */
  children: ReactNode;
}

/**
 * Renders an error message with an alert circle icon in `orange.8`.
 *
 * @param props - Component props
 * @returns Inline group with icon and bold error text
 */
export default function ErrorMessage({ children }: ErrorMessageProps) {
  return (
    <Group gap={6} align="center" wrap="nowrap">
      <Box style={{ flexShrink: 0, position: "relative", top: 2 }}>
        <IconAlertCircle size={28} color="var(--error-color)" />
      </Box>
      <Text size="lg" c="var(--error-color)" fw={700}>
        {children}
      </Text>
    </Group>
  );
}
