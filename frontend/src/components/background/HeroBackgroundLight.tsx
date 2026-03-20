import { Box } from "@mantine/core";
import type { ReactNode } from "react";

interface HeroBackgroundLightProps {
  children?: ReactNode;
}

export default function HeroBackgroundLight({
  children,
}: HeroBackgroundLightProps) {
  return (
    <Box
      data-testid="hero-background-light"
      style={{
        background: "#112240",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box style={{ position: "relative", zIndex: 1 }}>{children}</Box>
    </Box>
  );
}
