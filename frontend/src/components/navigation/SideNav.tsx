// src/components/SideNav.tsx
import {
  Divider,
  NavLink as MantineNavLink,
  Stack,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";

export default function SideNav({ showSearch }: { showSearch: boolean }) {
  const location = useLocation();
  return (
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
      />
      <MantineNavLink
        component={Link}
        to="/about"
        label="About"
        active={location.pathname === "/about"}
      />
    </Stack>
  );
}
