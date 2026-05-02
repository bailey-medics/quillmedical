import { Title } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import type { ReactNode } from "react";

export interface HeaderTextProps {
  children: ReactNode;
  /** Optional colour override */
  c?: MantineColor;
}

export default function HeaderText({ children, c }: HeaderTextProps) {
  return (
    <Title order={2} c={c}>
      {children}
    </Title>
  );
}
