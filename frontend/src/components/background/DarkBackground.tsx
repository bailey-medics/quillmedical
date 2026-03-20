import { Box } from "@mantine/core";
import type { ReactNode } from "react";

interface DarkBackgroundProps {
  children?: ReactNode;
}

export default function DarkBackground({ children }: DarkBackgroundProps) {
  return (
    <Box
      data-testid="dark-background"
      pb="3rem"
      style={{
        background: "#0A1628",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box style={{ position: "relative", zIndex: 1 }}>{children}</Box>
    </Box>
  );
}
