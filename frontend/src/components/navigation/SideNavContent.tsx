// components/navigation/SideNavContent.tsx
import { NavLink, Stack } from "@mantine/core";

export default function SideNavContent({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <Stack gap="xs" role="navigation" aria-label="Primary">
      <NavLink label="Home" onClick={onNavigate} />
      <NavLink label="Patients" onClick={onNavigate} />
      <NavLink label="Letters" onClick={onNavigate} />
      <NavLink label="Settings" onClick={onNavigate} />
    </Stack>
  );
}
