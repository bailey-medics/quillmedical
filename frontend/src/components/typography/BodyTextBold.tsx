import { Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface BodyTextBoldProps {
  children: ReactNode;
}

export default function BodyTextBold({ children }: BodyTextBoldProps) {
  return (
    <Text size="lg" c="black" fw={700}>
      {children}
    </Text>
  );
}
