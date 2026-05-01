import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

export interface BodyTextProps {
  children: ReactNode;
}

export default function BodyText({ children }: BodyTextProps) {
  return (
    <Text size="lg" fw={typographyTokens.fontWeights.body}>
      {children}
    </Text>
  );
}
