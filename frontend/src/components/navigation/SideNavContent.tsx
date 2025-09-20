import { NavLink, ThemeIcon } from "@mantine/core";
import { IconHome2, IconLogout, IconSettings } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

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
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <NavLink
        label="Home"
        onClick={() => {
          navigate("/");
          if (onNavigate) onNavigate();
        }}
        leftSection={
          showIcons ? (
            <LeftIcon>
              <IconHome2 size={16} />
            </LeftIcon>
          ) : undefined
        }
      />
      <NavLink
        label="Settings"
        onClick={() => {
          navigate("/settings");
          if (onNavigate) onNavigate();
        }}
        leftSection={
          showIcons ? (
            <LeftIcon>
              <IconSettings size={16} />
            </LeftIcon>
          ) : undefined
        }
      />
      <NavLink
        label="Logout"
        onClick={() => {
          void logout();
          if (onNavigate) onNavigate();
        }}
        leftSection={
          showIcons ? (
            <LeftIcon>
              <IconLogout size={16} />
            </LeftIcon>
          ) : undefined
        }
      />
    </>
  );
}
