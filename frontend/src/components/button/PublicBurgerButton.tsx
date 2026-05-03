import { ActionIcon } from "@mantine/core";
import { IconMenu2 } from "@/components/icons/appIcons";
import classes from "./PublicBurgerButton.module.css";

interface PublicBurgerButtonProps {
  /** Whether the navigation is currently open */
  navOpen: boolean;
  /** Callback when the button is clicked */
  onClick: () => void;
}

export default function PublicBurgerButton({
  navOpen,
  onClick,
}: PublicBurgerButtonProps) {
  return (
    <ActionIcon
      variant="subtle"
      size="lg"
      onClick={onClick}
      aria-controls="app-navbar"
      aria-label={navOpen ? "Close navigation" : "Open navigation"}
      aria-expanded={navOpen}
      className={classes.burger}
    >
      <IconMenu2 size={32} stroke={2.5} />
    </ActionIcon>
  );
}
