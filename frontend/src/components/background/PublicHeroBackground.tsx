import { Box } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./PublicHeroBackground.module.css";

interface PublicHeroBackgroundProps {
  children?: ReactNode;
}

export default function PublicHeroBackground({
  children,
}: PublicHeroBackgroundProps) {
  return (
    <Box data-testid="hero-background" pb="3rem" className={classes.root}>
      {/* Layer 1 — radial glow */}
      <Box data-testid="hero-glow" className={classes.glow} />

      {/* Layer 2 — grid lines */}
      <Box data-testid="hero-grid" className={classes.grid} />

      {/* Content slot */}
      <Box data-testid="hero-content" className={classes.content}>
        {children}
      </Box>
    </Box>
  );
}
