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
  /**
   * Pages below the module, each nested inside the one before: a result,
   * then its results by question. Shown only while one of them is open,
   * so somebody can see where they are in the menu without the menu
   * gaining a permanent entry. Hung under the module when it is known,
   * and straight under Teaching while it is still loading.
   */
  trail?: { label: string; href: string }[];
  /** Called after any navigation (e.g. to close mobile drawer) */
  onNavigate?: () => void;
}

export default function TeachingMainNav({
  moduleName,
  moduleHref,
  trail,
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

  // The trail as one chain, last page innermost: each link is the only
  // child of the one before it.
  const trailItems = (trail ?? []).reduceRight<NavItem[]>(
    (inner, page) => [
      {
        label: page.label,
        href: page.href,
        // A page in the trail is marked only on its own address. Its
        // children's addresses are not beneath it in the URL, and without
        // this "Result" would stay highlighted on "Results by question".
        exact: true,
        ...(inner.length > 0 ? { children: inner } : {}),
      },
    ],
    [],
  );

  // The one thing genuinely local to here: the module being worked on,
  // and any pages open beneath it, hung under the Teaching entry the
  // shared list already provides.
  const moduleItems: NavItem[] =
    truncatedName && moduleHref
      ? [
          {
            label: truncatedName,
            href: moduleHref,
            ...(trailItems.length > 0 ? { children: trailItems } : {}),
          },
        ]
      : trailItems;

  const navItems: NavItem[] = featureItems.map((item) =>
    item.href === "/teaching" && moduleItems.length > 0
      ? { ...item, children: moduleItems }
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
