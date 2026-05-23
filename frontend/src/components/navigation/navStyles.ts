/**
 * Shared navigation styles
 *
 * Single source of truth for NavLink styling across all nav
 * components (SideNavContent, DashboardNav, ModuleNav, LearningNav,
 * NestedNavLink). Keeps font size, weight, and icon dimensions
 * consistent without duplicating constants.
 */

import { typographyTokens } from "@/theme";

/** Consistent font size for all nav link labels */
export const NAV_FONT_SIZE = "var(--mantine-font-size-md)";

/** Icon size matching NavIcon "lg" (22px) */
export const NAV_ICON_SIZE = 22;

/** Icon colour matching NavIcon default */
export const NAV_ICON_COLOUR = "var(--mantine-color-gray-6)";

/**
 * Standard NavLink styles object for Mantine's `styles` prop.
 * Applies to both root and label to ensure consistent sizing.
 */
export const navLinkStyles = {
  root: { fontSize: NAV_FONT_SIZE },
  label: {
    fontSize: NAV_FONT_SIZE,
    fontWeight: typographyTokens.fontWeights.body,
    whiteSpace: "normal" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.3,
  },
};
