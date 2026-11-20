/**
 * ErrorMessage Component
 *
 * Validation and error message text with an alert icon.
 * Uses `--error-color`, an orange-red, for colour-blind accessibility
 * (avoids red/green ambiguity).
 */

import { Box, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { IconAlertCircle } from "@/components/icons/appIcons";
import { typographyTokens } from "@/theme";
import classes from "./ErrorMessage.module.css";

export interface ErrorMessageProps {
  /** Error message content */
  children: ReactNode;
}

/**
 * Renders an error message with an alert circle icon in `--error-color`.
 *
 * @param props - Component props
 * @returns Inline group with icon and bold error text
 */
// Spans throughout: Mantine puts a field's error inside its own <p>, and a
// <p> cannot hold a <div> or another <p>.
export default function ErrorMessage({ children }: ErrorMessageProps) {
  return (
    <Box component="span" className={classes.root}>
      <Box component="span" className={classes.icon}>
        <IconAlertCircle size="100%" color="var(--error-color)" />
      </Box>
      <Text
        component="span"
        size="md"
        c="var(--error-color)"
        fw={typographyTokens.fontWeights.bold}
      >
        {children}
      </Text>
    </Box>
  );
}
