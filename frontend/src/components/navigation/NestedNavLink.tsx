/**
 * Nested NavLink Component
 *
 * Recursive navigation link component that supports:
 * - Nested child navigation items
 * - Auto-expansion when active route matches parent or children
 * - Visual hierarchy with indentation and font sizing
 * - Optional icon display
 */

import { NavLink } from "@mantine/core";
import { Link, useLocation, useNavigate } from "react-router-dom";
import NavIcon from "../icons/NavIcon";
// Taken from `NavIcon` rather than restated. This was a copy of that
// list and had fallen a name behind: `passport` was missing, so a
// passport entry could not be a `NavItem` at all and had to be
// hand-rolled as a bare `NavLink` in the sidebar. Importing the real
// type means the next icon added there works here unremarked.
import type { IconName } from "../icons/NavIcon";
import { useNavCollapsed } from "@/components/layouts/useNavCollapsed";
import { NAV_DRAWER_OPEN_STATE } from "./navDrawerState";
import { navLinkStyles } from "./navStyles";

/**
 * Navigation item configuration
 */
export type NavItem = {
  /** Display label */
  label: string;
  /** Route path (optional for parent-only group headers) */
  href?: string;
  /** Optional icon name (uses NavIcon) */
  icon?: IconName;
  /** Optional child navigation items */
  children?: NavItem[];
  /**
   * Leave the mobile drawer open when this item is pressed. For a
   * heading such as Admin, whose page is mostly a way to its children:
   * pressing it reveals them, and closing the drawer at that moment
   * hides them again, so reaching one took a second trip to the
   * hamburger.
   */
  keepsDrawerOpen?: boolean;
  /**
   * Highlight on this item's own address only. An item with no children
   * otherwise stays highlighted on every page beneath it, which is right
   * when nothing else in the menu names that page and wrong when
   * something does: two entries then claim to be where you are.
   */
  exact?: boolean;
};

/**
 * NestedNavLink Props
 */
type Props = {
  /** Navigation item configuration */
  item: NavItem;
  /** Called after navigation (to close mobile drawer) */
  onNavigate?: () => void;
  /** Whether to show icons */
  showIcons?: boolean;
  /** Nesting level for indentation (internal use) */
  level?: number;
};

/**
 * Check if navigation item or any child matches the current path
 *
 * @param navItem - Navigation item to check
 * @param path - Current pathname
 * @returns True if item or any descendant matches path
 */
function isActiveOrParent(navItem: NavItem, path: string): boolean {
  // Exact match (only if href is set)
  if (navItem.href && path === navItem.href) return true;

  // Child route match (starts with parent path + /)
  if (navItem.href && path.startsWith(navItem.href + "/")) return true;

  // Check children recursively
  if (navItem.children) {
    return navItem.children.some((child) => isActiveOrParent(child, path));
  }

  return false;
}

/**
 * Recursive Navigation Link Item
 *
 * Renders a navigation link that:
 * - Highlights when active (exact match)
 * - Highlights when parent of active route
 * - Expands to show children when active path matches
 * - Supports unlimited nesting levels with visual indentation
 *
 * Child items are:
 * - Indented by 1.5rem per level (plus 2.5rem when icons are shown)
 * - Font size reduced by 12.5% (0.875 multiplier)
 * - Aligned with parent text (accounts for icon space)
 *
 * @param props - Component props
 * @returns Navigation link with optional nested children
 */

export default function NestedNavLink({
  item,
  onNavigate,
  showIcons = false,
  level = 0,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = item.href
    ? location.pathname === item.href ||
      (!item.exact &&
        !item.children?.length &&
        location.pathname.startsWith(item.href + "/"))
    : false;
  const shouldExpand = isActiveOrParent(item, location.pathname);
  const hasChildren = item.children && item.children.length > 0;

  const afterNavigate = item.keepsDrawerOpen ? undefined : onNavigate;

  // Not calling `onNavigate` keeps the drawer open only while the layout
  // stays the same. Where the link leads to another layout, that one
  // mounts with its own drawer, so the link asks it to start open. Only
  // while the navigation is folded away: on a wide screen the link is in
  // the side bar, and there is no drawer to carry.
  const navCollapsed = useNavCollapsed();
  const linkState =
    item.keepsDrawerOpen && navCollapsed ? NAV_DRAWER_OPEN_STATE : undefined;

  const handleClick = () => {
    if (item.href) {
      navigate(item.href);
    } else if (hasChildren && item.children![0].href) {
      navigate(item.children![0].href);
    }
    afterNavigate?.();
  };

  // Calculate indentation for child items
  // Level 1 items (direct children of top-level) with icons get more indent
  // to account for icon spacing. Non-icon children use tighter indentation.
  const hasIcon = showIcons && !!item.icon;
  let totalPaddingLeft: number | undefined;
  if (level === 0) {
    totalPaddingLeft = undefined;
  } else if (hasIcon) {
    totalPaddingLeft = level === 1 ? 1.9 : level * 1.5;
  } else {
    totalPaddingLeft = 0.6 + level * 0.75;
  }

  const nestedStyles = {
    root: {
      ...navLinkStyles.root,
      paddingLeft: totalPaddingLeft ? `${totalPaddingLeft}rem` : undefined,
    },
    label: navLinkStyles.label,
  };

  return (
    <>
      {item.href ? (
        // A real link: focusable, announced as a link, and it opens in a
        // new tab like any other
        <NavLink
          component={Link}
          to={item.href}
          state={linkState}
          label={item.label}
          styles={nestedStyles}
          active={isActive}
          onClick={() => afterNavigate?.()}
          leftSection={
            showIcons && item.icon ? <NavIcon name={item.icon} /> : undefined
          }
        />
      ) : (
        <NavLink
          label={item.label}
          styles={nestedStyles}
          active={isActive}
          onClick={handleClick}
          leftSection={
            showIcons && item.icon ? <NavIcon name={item.icon} /> : undefined
          }
        />
      )}
      {hasChildren && shouldExpand && (
        <>
          {item.children!.map((child) => (
            <NestedNavLink
              key={child.href ?? child.label}
              item={child}
              onNavigate={onNavigate}
              showIcons={showIcons}
              level={level + 1}
            />
          ))}
        </>
      )}
    </>
  );
}
