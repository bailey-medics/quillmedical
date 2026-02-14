/**
 * Navigation Icon Component Module
 *
 * Provides consistent styled navigation icons using Tabler Icons.
 * Supports multiple icon types (home, settings, logout, user, bell,
 * message, file) with configurable sizes (xs, sm, md, lg, xl).
 */

import { ThemeIcon } from "@mantine/core";
import {
  IconHome2,
  IconSettings,
  IconLogout,
  IconUser,
  IconBell,
  IconMessage,
  IconFileText,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";

/** Available icon types */
type IconName =
  | "home"
  | "settings"
  | "logout"
  | "user"
  | "bell"
  | "message"
  | "file"
  | "adjustments";

/** Available icon sizes */
type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * NavIcon Props
 */
type NavIconProps = {
  /** Icon type to display */
  name: IconName;
  /** Icon size preset (default: "md") */
  size?: IconSize;
};

/** Map icon names to Tabler icon components */
const iconMap = {
  home: IconHome2,
  settings: IconSettings,
  logout: IconLogout,
  user: IconUser,
  bell: IconBell,
  message: IconMessage,
  file: IconFileText,
  adjustments: IconAdjustmentsHorizontal,
} as const;

// Map size to icon pixel dimensions
const iconSizeMap: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 28,
  xl: 36,
};

/**
 * Navigation icon wrapper component
 * Provides consistent styling for navigation icons throughout the application
 *
 * @param name - The name of the icon to display
 * @param size - The size preset (xs, sm, md, lg, xl) - affects both icon and circle (default: lg)
 */
export default function NavIcon({ name, size = "lg" }: NavIconProps) {
  const Icon = iconMap[name];
  const iconPixelSize = iconSizeMap[size];

  return (
    <ThemeIcon variant="light" color="gray" radius="xl" size={size}>
      <Icon size={iconPixelSize} />
    </ThemeIcon>
  );
}
