/**
 * ActionCardButton Component
 *
 * A light-variant, full-width button used inside ActionCard components.
 * Supports either an onClick handler or a URL link destination.
 *
 * @example
 * ```tsx
 * <ActionCardButton label="View details" url="/patients/123" />
 * <ActionCardButton label="Create record" onClick={handleCreate} />
 * ```
 */

import { Button } from "@mantine/core";
import { Link } from "react-router-dom";

interface ActionCardButtonProps {
  /** Button label text */
  label: string;
  /** Button destination URL (renders as a link) */
  url?: string;
  /** Click handler (takes priority over url) */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Mantine button variant (default: "light") */
  variant?: "light" | "filled";
}

export default function ActionCardButton({
  label,
  url = "#",
  onClick,
  disabled = false,
  variant = "filled",
}: ActionCardButtonProps) {
  if (onClick) {
    return (
      <Button
        onClick={
          disabled ? (e: React.MouseEvent) => e.preventDefault() : onClick
        }
        variant={variant}
        fullWidth
        aria-disabled={disabled || undefined}
        styles={
          disabled
            ? { root: { opacity: 0.6, cursor: "not-allowed" } }
            : undefined
        }
        size="lg"
      >
        {label}
      </Button>
    );
  }

  return (
    <Button
      component={Link}
      to={url}
      variant={variant}
      fullWidth
      disabled={disabled}
      size="lg"
    >
      {label}
    </Button>
  );
}
