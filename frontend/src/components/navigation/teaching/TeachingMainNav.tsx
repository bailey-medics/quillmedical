/**
 * TeachingMainNav Component
 *
 * Sidebar navigation for teaching pages. Mirrors MainLayout's
 * SideNavContent pattern: uses NestedNavLink for route-based links,
 * determines admin access from auth state internally, and renders
 * Logout as a standalone NavLink action.
 */

import { NavLink, Stack } from "@mantine/core";
import { useAuth } from "@/auth/AuthContext";
import { useHasCompetency } from "@/lib/cbac/hooks";
import NavIcon from "@/components/icons/NavIcon";
import NestedNavLink, { type NavItem } from "../NestedNavLink";
import { navLinkStyles } from "../navStyles";

export interface TeachingMainNavProps {
  /** Module name shown as child link under Teaching (truncated to 15 chars) */
  moduleName?: string;
  /** href for the module child link (e.g. /teaching/bank-id) */
  moduleHref?: string;
  /** Called after any navigation (e.g. to close mobile drawer) */
  onNavigate?: () => void;
}

export default function TeachingMainNav({
  moduleName,
  moduleHref,
  onNavigate,
}: TeachingMainNavProps) {
  const { logout } = useAuth();

  // Matches the `/admin` route guard, so the link never leads to a 404.
  const hasAdminAccess = useHasCompetency("manage_users");

  const truncatedName =
    moduleName && moduleName.length > 15
      ? `${moduleName.slice(0, 15)}…`
      : moduleName;

  const teachingItem: NavItem = {
    label: "Teaching",
    href: "/teaching",
    icon: "teaching",
    children:
      truncatedName && moduleHref
        ? [{ label: truncatedName, href: moduleHref }]
        : undefined,
  };

  const navItems: NavItem[] = [
    teachingItem,
    { label: "Settings", href: "/settings", icon: "settings" },
    ...(hasAdminAccess
      ? [{ label: "Admin", href: "/admin", icon: "adjustments" as const }]
      : []),
  ];

  return (
    <Stack gap={0} p="sm">
      {navItems.map((item) => (
        <NestedNavLink
          key={item.label}
          item={item}
          onNavigate={onNavigate}
          showIcons
        />
      ))}
      <NavLink
        label="Logout"
        leftSection={<NavIcon name="logout" />}
        styles={navLinkStyles}
        onClick={() => {
          void logout();
          onNavigate?.();
        }}
      />
    </Stack>
  );
}
