/**
 * Side Navigation Component
 *
 * Primary navigation panel with optional search field and navigation items.
 * Used in main layout sidebar and mobile navigation drawer.
 */

import { Divider, Stack, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import SideNavContent from "./SideNavContent";

/**
 * SideNav Props
 */
type Props = {
  /** Whether to show the search input field at the top */
  showSearch: boolean;
  /** Called after a nav item is chosen (use to close mobile overlay) */
  onNavigate?: () => void;
  /** Whether to show icons next to navigation labels */
  showIcons?: boolean;
};

/**
 * Side Navigation
 *
 * Renders navigation menu with optional search field and navigation items.
 * Provides aria-label for accessibility.
 *
 * @param props - Component props
 * @returns Side navigation panel
 */
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
