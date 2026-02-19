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
import Icon, { type IconSize } from "@/components/icons/Icon";

/**
 * Size map for ActionIcon container (needs padding around icon)
 * - sm: 36px container for 20px icon
 * - md: 44px container for 28px icon
 * - lg: 60px container for 48px icon
 */
const actionIconSizeMap: Record<IconSize, number> = {
  sm: 36,
  md: 44,
  lg: 60,
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
  /** Loading state */
  loading?: boolean;
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
 *   color="blue"
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
      <Icon icon={icon} size={size} />
    </ActionIcon>
  );
}
