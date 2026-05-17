/**
 * TeachingMainNav Component
 *
 * Sidebar navigation for the teaching dashboard page.
 * Shows Settings, Admin (conditional), and Logout links.
 */

import { NavLink, Stack } from "@mantine/core";
import NavIcon from "@/components/icons/NavIcon";
import { navLinkStyles } from "../navStyles";

export interface TeachingMainNavProps {
  /** Called when Settings is clicked */
  onSettings: () => void;
  /** Called when Admin is clicked (only shown when provided) */
  onAdmin?: () => void;
  /** Called when Logout is clicked */
  onLogout: () => void;
}

export default function TeachingMainNav({
  onSettings,
  onAdmin,
  onLogout,
}: TeachingMainNavProps) {
  return (
    <Stack gap={0} p="sm">
      <NavLink
        label="Teaching"
        leftSection={<NavIcon name="teaching" />}
        active
        styles={navLinkStyles}
        component="div"
      />
      <NavLink
        label="Settings"
        leftSection={<NavIcon name="settings" />}
        onClick={onSettings}
        styles={navLinkStyles}
      />
      {onAdmin && (
        <NavLink
          label="Admin"
          leftSection={<NavIcon name="adjustments" />}
          onClick={onAdmin}
          styles={navLinkStyles}
        />
      )}
      <NavLink
        label="Logout"
        leftSection={<NavIcon name="logout" />}
        onClick={onLogout}
        styles={navLinkStyles}
      />
    </Stack>
  );
}
