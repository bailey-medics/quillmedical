import { colours } from "@/styles/colours";
import { Box } from "@mantine/core";
import type { ReactNode } from "react";

interface PublicLightBackgroundProps {
  children?: ReactNode;
}

export default function PublicLightBackground({
  children,
}: PublicLightBackgroundProps) {
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
