/**
 * SearchButton Component
 *
 * Transparent icon button for the search toggle on the top ribbon.
 * Renders a white magnifying glass on a lighter navy hover area.
 * Designed to sit on the primary navy ribbon background.
 */

import { ActionIcon } from "@mantine/core";
import { IconSearch } from "@/components/icons/appIcons";

interface SearchButtonProps {
  /** Click handler to toggle the search field */
  onClick: () => void;
}

export default function SearchButton({ onClick }: SearchButtonProps) {
  return (
    <ActionIcon
      variant="subtle"
      size="lg"
      onClick={onClick}
      aria-label="Open search"
      style={{
        color: "white",
        "--ai-hover": "var(--mantine-color-primary-6)",
        "--ai-hover-color": "white",
      }}
    >
      <IconSearch size={30} stroke={2.5} />
    </ActionIcon>
  );
}
