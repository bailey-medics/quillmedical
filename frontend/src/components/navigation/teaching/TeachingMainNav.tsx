/**
 * TeachingMainNav Component
 *
 * Sidebar navigation for teaching pages. Mirrors MainLayout's
 * SideNavContent pattern: uses NestedNavLink for route-based links,
 * determines admin access from auth state internally, and renders
 * Feedback and Logout as standalone actions.
 */

import { NavLink, Stack } from "@mantine/core";
import { useAuth } from "@/auth/AuthContext";
import SendFeedbackNavLink from "@/components/feedback/SendFeedbackNavLink";
import NavIcon from "@/components/icons/NavIcon";
import NestedNavLink, { type NavItem } from "../NestedNavLink";
import { useFeatureNavItems } from "../featureNavItems";
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

  // The same entries the main sidebar shows. Teaching is not an org_unit
  // apart: somebody on a teaching page still has a passport, and used
  // to watch the link disappear because this file kept its own list.
  const featureItems = useFeatureNavItems();

  const truncatedName =
    moduleName && moduleName.length > 15
      ? `${moduleName.slice(0, 15)}…`
      : moduleName;

  // The one thing genuinely local to here: the module being worked on,
  // hung under the Teaching entry the shared list already provides.
  const navItems: NavItem[] = featureItems.map((item) =>
    item.href === "/teaching" && truncatedName && moduleHref
      ? { ...item, children: [{ label: truncatedName, href: moduleHref }] }
      : item,
  );

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
      <SendFeedbackNavLink onNavigate={onNavigate} />
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
