/**
 * IconButton Component
 *
 * Wrapper around Mantine's ActionIcon that automatically sizes the container
 * to match the Icon component's sm/md/lg sizes.
 * Provides consistent icon button sizing across the application.
 */

import type { ReactElement, MouseEventHandler } from "react";
import { ActionIcon } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import Icon, { type IconSize } from "@/components/icons";

/**
 * Size map for ActionIcon container — aligned to Mantine Button heights
 * so IconButton matches AddButton / ButtonPair at the same size level.
 */
const actionIconSizeMap: Record<IconSize, number> = {
  sm: 36,
  md: 42,
  lg: 50,
  xl: 60,
};

/**
 * Icon size inside the container — keeps the icon proportional so it
 * doesn't overflow the (now smaller) container at lg/xl.
 */
const iconSizeMap: Record<IconSize, IconSize> = {
  sm: "sm",
  md: "md",
  lg: "md",
  xl: "lg",
};

interface IconButtonProps {
  /** Icon element from @tabler/icons-react */
  icon: ReactElement;
  /** Size variant - defaults to md */
  size?: IconSize;
  /** Mantine variant */
  variant?:
    | "filled"
    | "light"
    | "outline"
    | "subtle"
    | "transparent"
    | "default"
    | "white"
    | "gradient";
  /** Color from Mantine theme */
  color?: MantineColor;
  /** Click handler */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Accessibility label */
  "aria-label"?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * IconButton component that wraps ActionIcon with automatic sizing.
 *
 * @param props - Component props
 * @returns ActionIcon with Icon inside
 *
 * @example
 * ```tsx
 * <IconButton
 *   icon={<IconPencil />}
 *   size="lg"
 *   variant="subtle"
 *   color="primary"
 *   onClick={handleClick}
 *   aria-label="Edit"
 * />
 * ```
 */
export default function IconButton({
  icon,
  size = "md",
  ...actionIconProps
}: IconButtonProps) {
  const actionIconSize = actionIconSizeMap[size];

  return (
    <ActionIcon {...actionIconProps} size={actionIconSize}>
      <Icon icon={icon} size={iconSizeMap[size]} />
    </ActionIcon>
  );
}
