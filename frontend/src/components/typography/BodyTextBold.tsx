import { Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface BodyTextBoldProps {
  children: ReactNode;
  /** Text alignment. Defaults to "left". */
  justify?: "left" | "centre" | "right";
}

const alignMap = {
  left: "left",
  centre: "center",
  right: "right",
} as const;

export default function BodyTextBold({
  children,
  justify = "left",
}: BodyTextBoldProps) {
  return (
    <Text size="lg" c="black" fw={700} ta={alignMap[justify]}>
      {children}
    </Text>
  );
}
