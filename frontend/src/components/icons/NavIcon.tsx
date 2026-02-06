import { ThemeIcon } from "@mantine/core";
import {
  IconHome2,
  IconSettings,
  IconLogout,
  IconUser,
  IconBell,
  IconMessage,
  IconFileText,
} from "@tabler/icons-react";

type IconName =
  | "home"
  | "settings"
  | "logout"
  | "user"
  | "bell"
  | "message"
  | "file";

type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

type NavIconProps = {
  name: IconName;
  size?: IconSize;
};

const iconMap = {
  home: IconHome2,
  settings: IconSettings,
  logout: IconLogout,
  user: IconUser,
  bell: IconBell,
  message: IconMessage,
  file: IconFileText,
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
