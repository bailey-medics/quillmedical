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

import { Badge, Skeleton } from "@mantine/core";
import type { MantineSize } from "@mantine/core";

export type UserPermission = "superadmin" | "admin" | "staff" | "patient";
interface PermissionBadgeProps {
  /** System permission level */
  permission: UserPermission;
  /** Badge size - defaults to lg */
  size?: MantineSize;
  /** Badge variant - defaults to filled */
  variant?: "filled" | "light" | "outline" | "dot" | "default";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
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
  patient: "orange",
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
const SKELETON_WIDTHS: Record<string, number> = {
  sm: 65,
  md: 75,
  lg: 80,
  xl: 140,
};

const SKELETON_HEIGHTS: Record<string, number> = {
  sm: 19,
  md: 21,
  lg: 27,
  xl: 40,
};

export default function PermissionBadge({
  permission,
  size = "lg",
  variant = "filled",
  isLoading = false,
}: PermissionBadgeProps) {
  if (isLoading) {
    return (
      <Skeleton
        width={SKELETON_WIDTHS[size] ?? 90}
        height={SKELETON_HEIGHTS[size] ?? 36}
        radius="xl"
      />
    );
  }

  if (!permission) {
    return null;
  }

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
