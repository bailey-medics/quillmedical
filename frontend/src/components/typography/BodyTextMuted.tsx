import { Text } from "@mantine/core";
import type { ReactNode } from "react";

interface BodyTextMutedProps {
  children: ReactNode;
}

export default function BodyTextMuted({ children }: BodyTextMutedProps) {
  return (
    <Text size="lg" c="dimmed">
      {children}
    </Text>
  );
}
