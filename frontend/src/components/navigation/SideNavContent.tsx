/**
 * Side Navigation Content Component
 *
 * Renders the actual navigation links and items for the side navigation.
 * Includes Home, Settings, About, and Logout links with optional icons.
 * Separated from SideNav to allow reuse in drawer/desktop contexts.
 */

import { NavLink, Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import NavIcon from "../icons/NavIcon";

/**
 * SideNavContent Props
 */
type Props = {
  /** Called after navigation (to close drawer on mobile) */
  onNavigate?: () => void;
  /** Whether to display icons next to labels */
  showIcons?: boolean;
  /** Font size for navigation labels (default: 20px) */
  fontSize?: number;
};

/**
 * Side Navigation Content
 *
 * Renders navigation link items with optional icons. Handles navigation
 * via React Router and logout functionality via AuthContext.
 *
 * @param props - Component props
 * @returns Navigation links stack
 */
export default function SideNavContent({
  onNavigate,
  showIcons = false,
  fontSize = 20,
}: Props) {
  const { logout, state } = useAuth();
  const navigate = useNavigate();

  // Check if user has admin or superadmin permissions
  const hasAdminAccess =
    state.status === "authenticated" &&
    (state.user.system_permissions === "admin" ||
      state.user.system_permissions === "superadmin");

  const navLinkStyles = {
    root: { fontSize: `${fontSize}px` },
    label: { fontSize: `${fontSize}px` },
  };

  return (
    <Stack gap={0}>
      <NavLink
        label="Home"
        styles={navLinkStyles}
        onClick={() => {
          navigate("/");
          if (onNavigate) onNavigate();
        }}
        leftSection={showIcons ? <NavIcon name="home" /> : undefined}
      />
      <NavLink
        label="Messages"
        styles={navLinkStyles}
        onClick={() => {
          navigate("/messages");
          if (onNavigate) onNavigate();
        }}
        leftSection={showIcons ? <NavIcon name="message" /> : undefined}
      />
      <NavLink
        label="Settings"
        styles={navLinkStyles}
        onClick={() => {
          navigate("/settings");
          if (onNavigate) onNavigate();
        }}
        leftSection={showIcons ? <NavIcon name="settings" /> : undefined}
      />
      {hasAdminAccess && (
        <NavLink
          label="Admin"
          styles={navLinkStyles}
          onClick={() => {
            navigate("/admin");
            if (onNavigate) onNavigate();
          }}
          leftSection={showIcons ? <NavIcon name="adjustments" /> : undefined}
        />
      )}
      <NavLink
        label="Logout"
        styles={navLinkStyles}
        onClick={() => {
          void logout();
          if (onNavigate) onNavigate();
        }}
        leftSection={showIcons ? <NavIcon name="logout" /> : undefined}
      />
    </Stack>
  );
}
