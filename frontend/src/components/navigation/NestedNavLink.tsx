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
import { useLocation, useNavigate } from "react-router-dom";
import NavIcon from "../icons/NavIcon";

/**
 * Icon name type (from NavIcon component)
 */
type IconName =
  | "home"
  | "settings"
  | "logout"
  | "user"
  | "bell"
  | "message"
  | "file"
  | "adjustments";

/**
 * Navigation item configuration
 */
export type NavItem = {
  /** Display label */
  label: string;
  /** Route path */
  href: string;
  /** Optional icon name (uses NavIcon) */
  icon?: IconName;
  /** Optional child navigation items */
  children?: NavItem[];
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
  /** Base font size in pixels (default: 20) */
  baseFontSize?: number;
};

/**
 * Check if navigation item or any child matches the current path
 *
 * @param navItem - Navigation item to check
 * @param path - Current pathname
 * @returns True if item or any descendant matches path
 */
function isActiveOrParent(navItem: NavItem, path: string): boolean {
  // Exact match
  if (path === navItem.href) return true;

  // Child route match (starts with parent path + /)
  if (path.startsWith(navItem.href + "/")) return true;

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
  baseFontSize = 20,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = location.pathname === item.href;
  const shouldExpand = isActiveOrParent(item, location.pathname);
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    navigate(item.href);
    onNavigate?.();
  };

  // Calculate font size: reduce by 12.5% for each level
  const fontSize = level > 0 ? baseFontSize * 0.875 : baseFontSize;

  // Calculate indentation for child items
  // When showIcons is true, add extra padding to account for icon width
  // Icon (ThemeIcon size="lg") is ~40px = 2.5rem, add 0.5rem for visual spacing = 3rem
  const iconOffset = showIcons ? 3 : 0;
  const levelIndent = level * 1.5;
  const totalPaddingLeft = level > 0 ? iconOffset + levelIndent : undefined;

  const navLinkStyles = {
    root: {
      paddingLeft: totalPaddingLeft ? `${totalPaddingLeft}rem` : undefined,
      fontSize: `${fontSize}px`,
    },
    label: {
      fontSize: `${fontSize}px`,
    },
  };

  return (
    <>
      <NavLink
        label={item.label}
        styles={navLinkStyles}
        active={isActive}
        onClick={handleClick}
        leftSection={
          showIcons && item.icon ? <NavIcon name={item.icon} /> : undefined
        }
      />
      {hasChildren && shouldExpand && (
        <>
          {item.children!.map((child) => (
            <NestedNavLink
              key={child.href}
              item={child}
              onNavigate={onNavigate}
              showIcons={showIcons}
              level={level + 1}
              baseFontSize={baseFontSize}
            />
          ))}
        </>
      )}
    </>
  );
}
