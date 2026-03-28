/**
 * Icon Component
 *
 * Wrapper component for standardized icon sizing across the application.
 * Provides consistent sm/md/lg sizing for all Tabler icons.
 * Icons automatically scale down on mobile (below theme.breakpoints.sm).
 */

import type { ReactElement } from "react";
import { cloneElement } from "react";
import { ThemeIcon, useMantineTheme } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

/**
 * Icon size variants mapped to pixel values
 * Desktop (≥768px):
 * - sm: 20px (inputs, small buttons, inline text)
 * - md: 28px (default size, general UI elements)
 * - lg: 48px (action cards, prominent features)
 * - xl: 72px (hero sections, landing page features)
 *
 * Mobile (<768px):
 * - sm: 16px
 * - md: 20px
 * - lg: 32px
 * - xl: 48px
 */
export type IconSize = "sm" | "md" | "lg" | "xl";

interface IconProps {
  /** Icon element from @tabler/icons-react */
  icon: ReactElement;
  /** Size variant - defaults to md */
  size?: IconSize;
  /** Icon colour — any valid CSS colour value */
  colour?: string;
  /** Optional class name for additional styling */
  className?: string;
  /** Wrap the icon in a circular ThemeIcon container with this colour */
  container?: MantineColor;
  /** ThemeIcon variant when container is set (default: "light") */
  containerVariant?: "light" | "filled" | "outline";
}

/** Desktop size map (≥768px) */
const desktopSizeMap: Record<IconSize, number> = {
  sm: 20,
  md: 28,
  lg: 48,
  xl: 72,
};

/** Mobile size map (<768px) */
const mobileSizeMap: Record<IconSize, number> = {
  sm: 16,
  md: 20,
  lg: 32,
  xl: 48,
};

/**
 * Icon component that wraps Tabler icons with consistent sizing.
 * Automatically scales down on mobile devices.
 * Optionally wraps in a circular ThemeIcon container.
 *
 * @param props - Component props
 * @returns Cloned icon element with size applied
 *
 * @example
 * ```tsx
 * <Icon icon={<IconPencil />} size="sm" />
 * <Icon icon={<IconUserPlus />} size="lg" />
 * <Icon icon={<IconCheck />} container="green" />
 * <Icon icon={<IconX />} container="red" containerVariant="filled" />
 * ```
 */
export default function Icon({
  icon,
  size = "md",
  colour,
  className,
  container,
  containerVariant = "light",
}: IconProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(
    `(max-width: ${theme.breakpoints.sm})`,
    false,
    { getInitialValueInEffect: false },
  );

  // Use desktop sizes by default (when isMobile is undefined or false)
  const sizeMap = isMobile ? mobileSizeMap : desktopSizeMap;
  const pixelSize = sizeMap[size];

  // Clone the icon element and pass size, colour and className props
  // Type assertion needed because cloneElement doesn't know about Tabler icon props
  const clonedIcon = cloneElement(icon, {
    size: pixelSize,
    ...(colour ? { color: colour } : {}),
    className,
  } as Partial<typeof icon.props>);

  if (container) {
    const containerIconSize = Math.round(pixelSize * 1.3);
    const containerIcon = cloneElement(icon, {
      size: containerIconSize,
      stroke: 2.5,
      ...(colour ? { color: colour } : {}),
      className,
    } as Partial<typeof icon.props>);

    return (
      <ThemeIcon
        color={container}
        variant={containerVariant}
        size={pixelSize + 16}
        radius="xl"
      >
        {containerIcon}
      </ThemeIcon>
    );
  }

  return clonedIcon;
}
