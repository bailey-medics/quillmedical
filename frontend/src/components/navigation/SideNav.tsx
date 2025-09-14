import { Divider, Stack, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import SideNavContent from "./SideNavContent";

type Props = {
  showSearch: boolean;
  /** Called after a nav item is chosen (use to close mobile overlay) */
  onNavigate?: () => void;
  showIcons?: boolean;
};

export default function SideNav({ showSearch, onNavigate, showIcons }: Props) {
  return (
    <nav
      role="navigation"
      aria-label="Primary"
      style={{ minWidth: 100, height: "100%", paddingRight: 14 }}
    >
      <Stack p="sm" gap="xs">
        {showSearch && (
          <>
            <TextInput
              aria-label="Search"
              placeholder="Search…"
              rightSectionPointerEvents="none"
              rightSection={<IconSearch size={16} />}
              style={{ paddingRight: 15 }}
            />
            <Divider my="xs" />
          </>
        )}
        <SideNavContent onNavigate={onNavigate} showIcons={showIcons} />
      </Stack>
    </nav>
  );
}
