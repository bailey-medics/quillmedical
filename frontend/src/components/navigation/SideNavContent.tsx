import { NavLink, ThemeIcon } from "@mantine/core";
import {
  IconFileText,
  IconHome2,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

type Props = {
  onNavigate?: () => void;
  showIcons?: boolean;
};

function LeftIcon({ children }: { children: React.ReactNode }) {
  return (
    <ThemeIcon variant="light" color="gray" radius="xl" size="sm">
      {children}
    </ThemeIcon>
  );
}

export default function SideNavContent({
  onNavigate,
  showIcons = false,
}: Props) {
  return (
    <>
      <NavLink
        label="Home"
        onClick={onNavigate}
        leftSection={
          showIcons ? (
            <LeftIcon>
              <IconHome2 size={16} />
            </LeftIcon>
          ) : undefined
        }
      />
      <NavLink
        label="Patients"
        onClick={onNavigate}
        leftSection={
          showIcons ? (
            <LeftIcon>
              <IconUsers size={16} />
            </LeftIcon>
          ) : undefined
        }
      />
      <NavLink
        label="Letters"
        onClick={onNavigate}
        leftSection={
          showIcons ? (
            <LeftIcon>
              <IconFileText size={16} />
            </LeftIcon>
          ) : undefined
        }
      />
      <NavLink
        label="Settings"
        onClick={onNavigate}
        leftSection={
          showIcons ? (
            <LeftIcon>
              <IconSettings size={16} />
            </LeftIcon>
          ) : undefined
        }
      />
    </>
  );
}
