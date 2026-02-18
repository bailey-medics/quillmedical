/**
 * Side Navigation Content Component
 *
 * Renders the actual navigation links and items for the side navigation.
 * Includes Home, Settings, About, and Logout links with optional icons.
 * Admin section uses NestedNavLink for hierarchical navigation.
 * Dynamically adds patient name as child when viewing patient admin page.
 * Separated from SideNav to allow reuse in drawer/desktop contexts.
 */

import { NavLink, Stack } from "@mantine/core";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "@/lib/api";
import NavIcon from "../icons/NavIcon";
import NestedNavLink, { type NavItem } from "./NestedNavLink";

/**
 * SideNavContent Props
 */
type Props = {
  /** Called after navigation (to close drawer on mobile) */
  onNavigate?: () => void;
  /** Whether to display icons next to labels */
  showIcons?: boolean;
  /** Font size for navigation labels (default: 1.25rem) */
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
  fontSize = 1.25,
}: Props) {
  const { logout, state } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [patientName, setPatientName] = useState<string | null>(null);

  // Check if user has admin or superadmin permissions
  const hasAdminAccess =
    state.status === "authenticated" &&
    (state.user.system_permissions === "admin" ||
      state.user.system_permissions === "superadmin");

  // Extract patient ID from URL if on patient admin page
  const patientIdMatch = location.pathname.match(
    /^\/admin\/patients\/([^/]+)$/,
  );
  const patientId = patientIdMatch ? patientIdMatch[1] : null;

  // Fetch patient name when on patient admin page
  useEffect(() => {
    async function fetchPatientName() {
      if (
        !patientId ||
        patientId === "new" ||
        patientId === "list" ||
        patientId === "edit" ||
        patientId === "deactivate"
      ) {
        setPatientName(null);
        return;
      }

      try {
        const patient = await api.get<{
          name: Array<{ given?: string[]; family?: string }>;
        }>(`/patients/${patientId}`);

        const name = patient.name?.[0];
        const givenName = name?.given?.[0] || "";
        const familyName = name?.family || "";
        const fullName = `${givenName} ${familyName}`.trim();
        setPatientName(fullName || "Unknown Patient");
      } catch (error) {
        console.error("Failed to fetch patient name:", error);
        setPatientName(null);
      }
    }

    fetchPatientName();
  }, [patientId]);

  const navLinkStyles = {
    root: { fontSize: `${fontSize}rem` },
    label: { fontSize: `${fontSize}rem` },
  };

  // Build Patients nav item with optional patient name child
  const patientsNavItem: NavItem = {
    label: "Patients",
    href: "/admin/patients",
    icon: showIcons ? "file" : undefined,
    children: patientName
      ? [
          {
            label: patientName,
            href: `/admin/patients/${patientId}`,
          },
        ]
      : undefined,
  };

  // Admin navigation structure with children
  const adminNavItem: NavItem = {
    label: "Admin",
    href: "/admin",
    icon: showIcons ? "adjustments" : undefined,
    children: [
      {
        label: "Users",
        href: "/admin/users",
        icon: showIcons ? "user" : undefined,
      },
      patientsNavItem,
      {
        label: "Permissions",
        href: "/admin/permissions",
        icon: showIcons ? "settings" : undefined,
      },
    ],
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
        <NestedNavLink
          item={adminNavItem}
          onNavigate={onNavigate}
          showIcons={showIcons}
          baseFontSize={fontSize}
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
