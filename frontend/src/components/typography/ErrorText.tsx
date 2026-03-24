import { Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface ErrorTextProps {
  children: ReactNode;
}

export default function ErrorText({ children }: ErrorTextProps) {
  return (
    <Text size="lg" c="red" fw={700}>
      {children}
    </Text>
  );
}
