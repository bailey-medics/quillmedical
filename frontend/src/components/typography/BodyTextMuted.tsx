import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

interface BodyTextMutedProps {
  children: ReactNode;
}

export default function BodyTextMuted({ children }: BodyTextMutedProps) {
  return (
    <Text size="lg" fw={typographyTokens.fontWeights.body} c="dimmed">
      {children}
    </Text>
  );
}
