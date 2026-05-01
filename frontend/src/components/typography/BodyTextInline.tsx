import { Text } from "@mantine/core";
import type { ReactNode } from "react";

interface BodyTextInlineProps {
  children: ReactNode;
}

export default function BodyTextInline({ children }: BodyTextInlineProps) {
  return (
    <Text component="span" size="lg" style={{ whiteSpace: "pre-wrap" }}>
      {children}
    </Text>
  );
}
