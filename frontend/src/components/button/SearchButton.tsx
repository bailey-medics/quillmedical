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
  /** Visual variant: "dark" for dark backgrounds, "light" for light backgrounds */
  variant?: "dark" | "light";
}

export default function SearchButton({
  onClick,
  variant = "dark",
}: SearchButtonProps) {
  const isDark = variant === "dark";

  return (
    <ActionIcon
      variant="subtle"
      size="lg"
      onClick={onClick}
      aria-label="Open search"
      style={{
        color: isDark ? "white" : "var(--mantine-color-primary-5)",
        "--ai-hover": isDark
          ? "var(--mantine-color-primary-6)"
          : "var(--mantine-color-gray-1)",
        "--ai-hover-color": isDark ? "white" : "var(--mantine-color-primary-5)",
      }}
    >
      <IconSearch size={30} stroke={2.5} />
    </ActionIcon>
  );
}
