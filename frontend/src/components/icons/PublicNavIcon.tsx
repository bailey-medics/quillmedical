/**
 * Public Navigation Icon Component
 *
 * Navy background with amber icon, matching the public pages colour scheme.
 * Mirrors NavIcon but uses the public site palette.
 */

import { colours } from "@/styles/colours";
import { ThemeIcon } from "@mantine/core";
import {
  IconHome2,
  IconChalkboardTeacher,
  IconBook,
  IconCurrencyPound,
  IconDatabase,
  IconMail,
} from "@tabler/icons-react";

/** Icon names available in public navigation */
export type PublicNavIconName =
  | "home"
  | "teaching"
  | "book"
  | "pricing"
  | "database"
  | "mail";

/** Available icon sizes */
type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

type PublicNavIconProps = {
  /** Icon type to display */
  name: PublicNavIconName;
  /** Icon size preset (default: "lg") */
  size?: IconSize;
};

const iconMap: Record<PublicNavIconName, typeof IconHome2> = {
  home: IconHome2,
  teaching: IconChalkboardTeacher,
  book: IconBook,
  pricing: IconCurrencyPound,
  database: IconDatabase,
  mail: IconMail,
};

const iconSizeMap: Record<IconSize, number> = {
  xs: 10,
  sm: 13,
  md: 16,
  lg: 22,
  xl: 29,
};

export default function PublicNavIcon({
  name,
  size = "lg",
}: PublicNavIconProps) {
  const Icon = iconMap[name];
  const iconPixelSize = iconSizeMap[size];

  return (
    <ThemeIcon
      variant="filled"
      radius="xl"
      size={size}
      style={{ backgroundColor: colours.darkBlue }}
    >
      <Icon size={iconPixelSize} color={colours.navIconAmber} stroke={2.5} />
    </ThemeIcon>
  );
}
