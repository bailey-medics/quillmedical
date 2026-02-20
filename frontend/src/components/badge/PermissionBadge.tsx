/**
 * PermissionBadge Component
 *
 * A specialized badge for displaying user system permission levels.
 * Enforces consistent styling and color mapping across the application.
 *
 * @example
 * ```tsx
 * <PermissionBadge permission="superadmin" />
 * <PermissionBadge permission="admin" size="lg" />
 * <PermissionBadge permission="staff" variant="light" />
 * ```
 */

import { Badge } from "@mantine/core";
import type { MantineSize } from "@mantine/core";

export type UserPermission = "superadmin" | "admin" | "staff";
interface PermissionBadgeProps {
  /** System permission level */
  permission: UserPermission;
  /** Badge size - defaults to xl */
  size?: MantineSize;
  /** Badge variant - defaults to filled */
  variant?: "filled" | "light" | "outline" | "dot" | "default";
}

/**
 * Maps system permissions to their corresponding badge colors.
 *
 * Color scheme:
 * - superadmin: green (highest privilege)
 * - admin: blue (elevated privilege)
 * - staff: gray (standard privilege)
 */
const PERMISSION_COLORS: Record<UserPermission, string> = {
  superadmin: "green",
  admin: "blue",
  staff: "gray",
};

/**
 * PermissionBadge displays a user's system permission level with
 * consistent color coding throughout the application.
 *
 * The badge automatically applies:
 * - Uppercase text transformation
 * - Pill-shaped borders (radius="xl")
 * - Predefined color scheme based on permission level
 *
 * Used on admin pages, user management interfaces, and permission displays.
 */
export default function PermissionBadge({
  permission,
  size = "xl",
  variant = "filled",
}: PermissionBadgeProps) {
  return (
    <Badge
      size={size}
      variant={variant}
      color={PERMISSION_COLORS[permission]}
      radius="xl"
    >
      {permission.toUpperCase()}
    </Badge>
  );
}
