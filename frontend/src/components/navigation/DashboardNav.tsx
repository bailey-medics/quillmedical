/**
 * DashboardNav Component
 *
 * Sidebar navigation for the teaching dashboard page.
 * Shows a list of available teaching modules, plus Settings and Logout links.
 */

import { NavLink, Stack } from "@mantine/core";
import { IconBook } from "@/components/icons/appIcons";
import NavIcon from "@/components/icons/NavIcon";
import { typographyTokens } from "@/theme";

export interface DashboardNavModule {
  /** Unique question bank ID */
  id: string;
  /** Display title */
  title: string;
}

export interface DashboardNavProps {
  /** Available teaching modules */
  modules: DashboardNavModule[];
  /** Called when a module is clicked */
  onModule: (id: string) => void;
  /** Called when Settings is clicked */
  onSettings: () => void;
  /** Called when Admin is clicked (only shown when provided) */
  onAdmin?: () => void;
  /** Called when Logout is clicked */
  onLogout: () => void;
}

/** Icon size matching NavIcon "lg" (22px) */
const NAV_ICON_SIZE = 22;
/** Icon colour matching NavIcon */
const NAV_ICON_COLOUR = "var(--mantine-color-gray-6)";

const navLabelStyles = {
  label: {
    fontSize: "var(--mantine-font-size-md)",
    fontWeight: typographyTokens.fontWeights.body,
  },
};

export default function DashboardNav({
  modules,
  onModule,
  onSettings,
  onAdmin,
  onLogout,
}: DashboardNavProps) {
  return (
    <Stack gap="xs" p="sm">
      <NavLink
        label="Modules"
        leftSection={<span style={{ width: NAV_ICON_SIZE }} />}
        styles={{
          label: {
            fontSize: "var(--mantine-font-size-md)",
            fontWeight: typographyTokens.fontWeights.bold,
          },
        }}
        component="div"
      />

      {modules.map((mod) => (
        <NavLink
          key={mod.id}
          label={mod.title}
          leftSection={
            <IconBook size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />
          }
          onClick={() => onModule(mod.id)}
          styles={navLabelStyles}
        />
      ))}

      <NavLink
        label="Settings"
        leftSection={<NavIcon name="settings" />}
        onClick={onSettings}
        styles={navLabelStyles}
      />
      {onAdmin && (
        <NavLink
          label="Admin"
          leftSection={<NavIcon name="adjustments" />}
          onClick={onAdmin}
          styles={navLabelStyles}
        />
      )}
      <NavLink
        label="Logout"
        leftSection={<NavIcon name="logout" />}
        onClick={onLogout}
        styles={navLabelStyles}
      />
    </Stack>
  );
}
