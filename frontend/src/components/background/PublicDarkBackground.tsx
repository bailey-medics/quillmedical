import { colours } from "@/styles/colours";
import { Box } from "@mantine/core";
import type { ReactNode } from "react";

interface PublicDarkBackgroundProps {
  children?: ReactNode;
}

export default function PublicDarkBackground({
  children,
}: PublicDarkBackgroundProps) {
  return (
    <Box
      data-testid="dark-background"
      pb="3rem"
      style={{
        background: colours.navy,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box style={{ position: "relative", zIndex: 1 }}>{children}</Box>
    </Box>
  );
}
