import { Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface BodyTextProps {
  children: ReactNode;
}

export default function BodyText({ children }: BodyTextProps) {
  return <Text size="lg">{children}</Text>;
}
