/**
 * IconTextButton Component
 *
 * A button with a leading icon and text label. Icons are restricted to a
 * known set — passing an unlisted icon name causes a TypeScript error.
 * Mirrors the AddButton pattern for consistent sizing and responsiveness.
 *
 * @example
 * ```tsx
 * <IconTextButton icon="refresh" label="Sync all" onClick={handleSync} />
 * ```
 */

import { Button, useMantineTheme } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import Icon from "@/components/icons";
import iconTextButtonIcons from "./iconTextButtonIcons";
import classes from "./IconTextButton.module.css";

type IconName = keyof typeof iconTextButtonIcons;

interface IconTextButtonProps {
  /** Icon to display (must be a registered name) */
  icon: IconName;
  /** Button label text */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Button colour (default: Mantine primary) */
  color?: MantineColor;
  /** Mantine button variant (default: "filled") */
  variant?: "filled" | "light" | "outline";
}

/**
 * IconTextButton displays a button with a leading icon and text.
 *
 * Features:
 * - Responsive sizing (lg desktop, md mobile)
 * - Type-safe icon selection via string literal union
 * - Consistent with AddButton sizing
 */
export default function IconTextButton({
  icon,
  label,
  onClick,
  disabled = false,
  loading = false,
  color,
  variant = "filled",
}: IconTextButtonProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  return (
    <Button
      leftSection={
        <Icon icon={iconTextButtonIcons[icon]} size={isMobile ? "sm" : "md"} />
      }
      onClick={onClick}
      size={isMobile ? "md" : "lg"}
      variant={variant}
      color={color}
      disabled={disabled}
      loading={loading}
      classNames={{ root: classes.root }}
      styles={{
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
