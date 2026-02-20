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

import { Button } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import Icon from "@/components/icons";

interface AddButtonProps {
  /** Button label text (e.g., "Add user", "Add patient") */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Loading state */
  loading?: boolean;
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
 * - Loading and disabled states
 *
 * Used for creating new users, patients, and other resources.
 */
export default function AddButton({
  label,
  onClick,
  loading = false,
  disabled = false,
}: AddButtonProps) {
  return (
    <Button
      leftSection={<Icon icon={<IconPlus />} size="md" />}
      onClick={onClick}
      size="lg"
      color="blue"
      loading={loading}
      disabled={disabled}
      styles={{
        label: {
          fontSize: "var(--mantine-font-size-lg)",
        },
      }}
    >
      {label}
    </Button>
  );
}
