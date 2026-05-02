import { Title } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import type { ReactNode } from "react";

export interface HeadingProps {
  children: ReactNode;
  /** Optional colour override */
  c?: MantineColor;
}

export default function Heading({ children, c }: HeadingProps) {
  return (
    <Title order={2} c={c}>
      {children}
    </Title>
  );
}
