import { ActionIcon } from "@mantine/core";
import { IconMenu2 } from "@/components/icons/appIcons";
import { colours } from "@/styles/colours";

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
      size="lg"
      onClick={onClick}
      aria-controls="app-navbar"
      aria-label={navOpen ? "Close navigation" : "Open navigation"}
      aria-expanded={navOpen}
      style={{
        color: colours.amber,
        "--ai-hover": "#1e2d4a",
        "--ai-hover-color": colours.amber,
      }}
    >
      <IconMenu2 size={32} stroke={2.5} />
    </ActionIcon>
  );
}
