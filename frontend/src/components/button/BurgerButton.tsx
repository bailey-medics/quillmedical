import { ActionIcon } from "@mantine/core";
import { IconMenu2 } from "@tabler/icons-react";

interface BurgerButtonProps {
  /** Whether the navigation is currently open */
  navOpen: boolean;
  /** Callback when the button is clicked */
  onClick: () => void;
}

export default function BurgerButton({ navOpen, onClick }: BurgerButtonProps) {
  return (
    <ActionIcon
      variant="subtle"
      onClick={onClick}
      aria-controls="app-navbar"
      aria-label={navOpen ? "Close navigation" : "Open navigation"}
      aria-expanded={navOpen}
      style={{ color: "#290661" }}
    >
      <IconMenu2 size={28} stroke={2.5} />
    </ActionIcon>
  );
}
