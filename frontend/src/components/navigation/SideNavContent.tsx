import { NavLink, Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import NavIcon from "../icons/NavIcon";

type Props = {
  onNavigate?: () => void;
  showIcons?: boolean;
  fontSize?: number;
};

export default function SideNavContent({
  onNavigate,
  showIcons = false,
  fontSize = 20,
}: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();

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
