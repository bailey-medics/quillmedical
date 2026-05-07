/**
 * AddButton Component
 *
 * A consistent button component for "Add" actions across the application.
 * Enforces uniform styling, sizing, and color scheme (blue) for all
 * create/add operations.
 *
 * @example
 * ```tsx
 * <AddButton label="Add user" onClick={() => navigate("/users/new")} />
 * <AddButton label="Add patient" onClick={handleAddPatient} disabled={loading} />
 * ```
 */

import { Button, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconPlus } from "@/components/icons/appIcons";
import Icon from "@/components/icons";

interface AddButtonProps {
  /** Button label text (e.g., "Add user", "Add patient") */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * AddButton displays a consistent blue button for add/create actions.
 *
 * Features:
 * - Large size (lg) for prominence
 * - Large font size for text
 * - Medium-sized plus icon
 * - Blue color scheme (consistent across all add actions)
 * - Disabled state
 *
 * Used for creating new users, patients, and other resources.
 */
export default function AddButton({
  label,
  onClick,
  disabled = false,
}: AddButtonProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  return (
    <Button
      leftSection={<Icon icon={<IconPlus />} size={isMobile ? "sm" : "md"} />}
      onClick={disabled ? (e: React.MouseEvent) => e.preventDefault() : onClick}
      size={isMobile ? "md" : "lg"}
      color="primary"
      aria-disabled={disabled || undefined}
      styles={{
        root: disabled ? { opacity: 0.6, cursor: "not-allowed" } : undefined,
        label: {
          fontSize: isMobile
            ? "var(--mantine-font-size-md)"
            : "var(--mantine-font-size-lg)",
        },
      }}
    >
      {label}
    </Button>
  );
}
