import { Title } from "@mantine/core";
import type { ReactNode } from "react";

export interface HeaderTextProps {
  children: ReactNode;
}

export default function HeaderText({ children }: HeaderTextProps) {
  return <Title order={3}>{children}</Title>;
}
