import { Divider as MantineDivider } from "@mantine/core";
import type { MantineSpacing } from "@mantine/core";

export interface DividerProps {
  /** Orientation — defaults to horizontal */
  orientation?: "horizontal" | "vertical";
  /** Vertical margin (Mantine spacing token) */
  my?: MantineSpacing;
  /** Top margin (Mantine spacing token) */
  mt?: MantineSpacing;
  /** Bottom margin (Mantine spacing token) */
  mb?: MantineSpacing;
  /** Optional label text displayed on the divider */
  label?: string;
  /** Label position — defaults to left */
  labelPosition?: "left" | "center" | "right";
}

export default function Divider({
  orientation = "horizontal",
  my,
  mt,
  mb,
  label,
  labelPosition,
}: DividerProps) {
  return (
    <MantineDivider
      orientation={orientation}
      my={my}
      mt={mt}
      mb={mb}
      label={label}
      labelPosition={labelPosition}
      color="var(--card-border, var(--mantine-color-gray-3))"
    />
  );
}
