/**
 * PublicLightBackground Component
 *
 * Light background section for public-facing pages.
 * Wraps content in a full-width light container with centred content area.
 */

import { Box } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./PublicLightBackground.module.css";

interface PublicLightBackgroundProps {
  children?: ReactNode;
}

export default function PublicLightBackground({
  children,
}: PublicLightBackgroundProps) {
  return (
    <Box data-testid="light-background" className={classes.root}>
      <Box className={classes.content}>{children}</Box>
    </Box>
  );
}
