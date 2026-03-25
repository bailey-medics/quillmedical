import { colours } from "@/styles/colours";
import { Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface PublicTextProps {
  /** Text content */
  children: ReactNode;
  /** Size variant — defaults to md */
  size?: "sm" | "md" | "lg";
  /** Text alignment — defaults to center */
  ta?: "left" | "center" | "right";
  /** Use dimmed colour instead of white — defaults to false */
  dimmed?: boolean;
  /** Top margin (Mantine spacing value) */
  mt?: string;
  /** Bottom margin (Mantine spacing value) */
  mb?: string;
}

export default function PublicText({
  children,
  size = "md",
  ta = "center",
  dimmed = false,
  mt,
  mb,
}: PublicTextProps) {
  return (
    <Text
      size={size}
      ta={ta}
      c={dimmed ? "dimmed" : colours.lightText}
      mt={mt}
      mb={mb}
    >
      {children}
    </Text>
  );
}
