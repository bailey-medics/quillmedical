/**
 * IconButton Component
 *
 * Wrapper around Mantine's ActionIcon that automatically sizes the container
 * to match the Icon component's md size.
 * Provides consistent icon button sizing across the application.
 */

import type { ReactElement, MouseEventHandler } from "react";
import { ActionIcon } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import Icon from "@/components/icons";

interface IconButtonProps {
  /** Icon element from @tabler/icons-react */
  icon: ReactElement;
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
 *   variant="subtle"
 *   color="primary"
 *   onClick={handleClick}
 *   aria-label="Edit"
 * />
 * ```
 */
export default function IconButton({
  icon,
  ...actionIconProps
}: IconButtonProps) {
  return (
    <ActionIcon {...actionIconProps} size={42}>
      <Icon icon={icon} size="md" />
    </ActionIcon>
  );
}
