/**
 * Icon Component
 *
 * Wrapper component for standardized icon sizing across the application.
 * Provides consistent sm/md/lg sizing for all Tabler icons.
 * Icons automatically scale down on mobile (below theme.breakpoints.sm).
 */

import type { ReactElement } from "react";
import { cloneElement } from "react";
import { useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

/**
 * Icon size variants mapped to pixel values
 * Desktop (≥768px):
 * - sm: 20px (inputs, small buttons, inline text)
 * - md: 28px (default size, general UI elements)
 * - lg: 48px (action cards, prominent features)
 *
 * Mobile (<768px):
 * - sm: 16px
 * - md: 20px
 * - lg: 32px
 */
export type IconSize = "sm" | "md" | "lg";

interface IconProps {
  /** Icon element from @tabler/icons-react */
  icon: ReactElement;
  /** Size variant - defaults to md */
  size?: IconSize;
  /** Optional class name for additional styling */
  className?: string;
}

/** Desktop size map (≥768px) */
const desktopSizeMap: Record<IconSize, number> = {
  sm: 20,
  md: 28,
  lg: 48,
};

/** Mobile size map (<768px) */
const mobileSizeMap: Record<IconSize, number> = {
  sm: 16,
  md: 20,
  lg: 32,
};

/**
 * Icon component that wraps Tabler icons with consistent sizing.
 * Automatically scales down on mobile devices.
 *
 * @param props - Component props
 * @returns Cloned icon element with size applied
 *
 * @example
 * ```tsx
 * <Icon icon={<IconPencil />} size="sm" />
 * <Icon icon={<IconUserPlus />} size="lg" />
 * ```
 */
export default function Icon({ icon, size = "md", className }: IconProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(
    `(max-width: ${theme.breakpoints.sm})`,
    false,
    { getInitialValueInEffect: false },
  );

  // Use desktop sizes by default (when isMobile is undefined or false)
  const sizeMap = isMobile ? mobileSizeMap : desktopSizeMap;
  const pixelSize = sizeMap[size];

  // Clone the icon element and pass size and className props
  // Type assertion needed because cloneElement doesn't know about Tabler icon props
  return cloneElement(icon, {
    size: pixelSize,
    className,
  } as Partial<typeof icon.props>);
}
