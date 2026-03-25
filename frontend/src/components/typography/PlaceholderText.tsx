import { Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface PlaceholderTextProps {
  children: ReactNode;
}

export default function PlaceholderText({ children }: PlaceholderTextProps) {
  return (
    <Text size="lg" style={{ color: "var(--mantine-color-placeholder)" }}>
      {children}
    </Text>
  );
}
