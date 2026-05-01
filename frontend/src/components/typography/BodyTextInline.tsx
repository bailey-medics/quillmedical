import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

interface BodyTextInlineProps {
  children: ReactNode;
}

export default function BodyTextInline({ children }: BodyTextInlineProps) {
  return (
    <Text
      component="span"
      size="lg"
      fw={typographyTokens.fontWeights.body}
      style={{ whiteSpace: "pre-wrap" }}
    >
      {children}
    </Text>
  );
}
