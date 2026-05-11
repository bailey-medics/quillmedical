import { Title } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import type { ReactNode } from "react";

export interface HeadingProps {
  children: ReactNode;
  /** Optional colour override */
  c?: MantineColor;
  /** Text alignment. Defaults to "left". */
  justify?: "left" | "centre" | "right";
}

const alignMap = {
  left: "left",
  centre: "center",
  right: "right",
} as const;

export default function Heading({
  children,
  c,
  justify = "left",
}: HeadingProps) {
  return (
    <Title order={2} c={c} ta={alignMap[justify]}>
      {children}
    </Title>
  );
}
