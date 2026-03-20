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
}

export default function PublicText({
  children,
  size = "md",
  ta = "center",
  dimmed = false,
}: PublicTextProps) {
  return (
    <Text size={size} ta={ta} c={dimmed ? "dimmed" : "rgba(245,240,232,0.55)"}>
      {children}
    </Text>
  );
}
