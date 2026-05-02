/**
 * Navigation Icon Component Module
 *
 * Provides consistent styled navigation icons using Tabler Icons.
 * Supports multiple icon types (home, settings, logout, user, bell,
 * message, file) with configurable sizes (xs, sm, md, lg, xl).
 */

import {
  IconHome2,
  IconSettings,
  IconLogout,
  IconUser,
  IconBell,
  IconMessage,
  IconFileText,
  IconAdjustmentsHorizontal,
  IconBuildingCommunity,
  IconChalkboardTeacher,
  IconBook,
  IconCurrencyPound,
  IconDatabase,
  IconMail,
} from "@/components/icons/appIcons";

/** Available icon types */
type IconName =
  | "home"
  | "settings"
  | "logout"
  | "user"
  | "bell"
  | "message"
  | "file"
  | "adjustments"
  | "building-community"
  | "teaching"
  | "book"
  | "pricing"
  | "database"
  | "mail";

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
  "building-community": IconBuildingCommunity,
  teaching: IconChalkboardTeacher,
  book: IconBook,
  pricing: IconCurrencyPound,
  database: IconDatabase,
  mail: IconMail,
} as const;

// Map size to icon pixel dimensions
const iconSizeMap: Record<IconSize, number> = {
  xs: 10,
  sm: 13,
  md: 16,
  lg: 22,
  xl: 29,
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

  return <Icon size={iconPixelSize} color="var(--mantine-color-gray-6)" />;
}
