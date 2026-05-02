import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { typographyTokens } from "@/theme";

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
    <Text
      size="lg"
      fw={typographyTokens.fontWeights.body}
      lineClamp={lineClamp}
    >
      {children}
    </Text>
  );
}
