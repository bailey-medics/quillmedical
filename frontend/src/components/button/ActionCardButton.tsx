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
}

export default function ActionCardButton({
  label,
  url = "#",
  onClick,
  disabled = false,
}: ActionCardButtonProps) {
  if (onClick) {
    return (
      <Button
        onClick={onClick}
        variant="light"
        fullWidth
        disabled={disabled}
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
      variant="light"
      fullWidth
      disabled={disabled}
      size="lg"
    >
      {label}
    </Button>
  );
}
