import { Text } from "@mantine/core";
import type { ReactNode } from "react";

interface BodyTextClampProps {
  children: ReactNode;
  /** Maximum number of visible lines before truncation with ellipsis */
  lineClamp: number;
}

export default function BodyTextClamp({
  children,
  lineClamp,
}: BodyTextClampProps) {
  return (
    <Text size="lg" c="dimmed" lineClamp={lineClamp}>
      {children}
    </Text>
  );
}
