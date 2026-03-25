import { colours } from "@/styles/colours";
import { Box } from "@mantine/core";
import type { ReactNode } from "react";

interface LightBackgroundProps {
  children?: ReactNode;
}

export default function LightBackground({ children }: LightBackgroundProps) {
  return (
    <Box
      data-testid="light-background"
      style={{
        background: colours.darkBlue,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box style={{ position: "relative", zIndex: 1 }}>{children}</Box>
    </Box>
  );
}
