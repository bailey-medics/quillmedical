import {
  Divider,
  NavLink as MantineNavLink,
  Stack,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";

type Props = {
  showSearch: boolean;
  /** Called after a nav item is chosen (use to close mobile overlay) */
  onNavigate?: () => void;
};

export default function SideNav({ showSearch, onNavigate }: Props) {
  const location = useLocation();

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      style={{ minWidth: 200, height: "100%" }}
    >
      <Stack p="sm" gap="xs">
        {showSearch && (
          <>
            <TextInput
              aria-label="Search"
              placeholder="Search…"
              rightSectionPointerEvents="none"
              rightSection={<IconSearch size={16} />}
            />
            <Divider my="xs" />
          </>
        )}

        <MantineNavLink
          component={Link}
          to="/"
          label="Home"
          active={location.pathname === "/"}
          onClick={onNavigate}
        />
        <MantineNavLink
          component={Link}
          to="/about"
          label="About"
          active={location.pathname === "/about"}
          onClick={onNavigate}
        />
      </Stack>
    </nav>
  );
}
