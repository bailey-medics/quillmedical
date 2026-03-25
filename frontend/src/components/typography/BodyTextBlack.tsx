import { Text } from "@mantine/core";
import type { ReactNode } from "react";

interface BodyTextBlackProps {
  children: ReactNode;
}

export default function BodyTextBlack({ children }: BodyTextBlackProps) {
  return (
    <Text size="lg" c="black" style={{ whiteSpace: "pre-wrap" }}>
      {children}
    </Text>
  );
}
