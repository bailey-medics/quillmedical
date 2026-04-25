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
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

export type UserPermission = "superadmin" | "admin" | "staff" | "patient";
interface PermissionBadgeProps {
  /** System permission level */
  permission: UserPermission;
  /** Badge size - defaults to lg */
  size?: MantineSize;
  /** Badge variant - defaults to light */
  variant?: "filled" | "light" | "outline" | "dot" | "default";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
}

const PERMISSION_CONFIG: Record<UserPermission, BadgeColourConfig> = {
  superadmin: badgeColours.success,
  admin: badgeColours.info,
  staff: badgeColours.neutral,
  patient: badgeColours.alert,
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
  size = "lg",
  variant = BADGE_VARIANT,
  isLoading = false,
}: PermissionBadgeProps) {
  if (isLoading) {
    return <BadgeSkeleton size={size as "sm" | "md" | "lg" | "xl"} />;
  }

  if (!permission) {
    return null;
  }

  return (
    <Badge
      size={size}
      variant={variant}
      color={PERMISSION_CONFIG[permission].bg}
      c={PERMISSION_CONFIG[permission].text}
      radius="xl"
    >
      {permission.toUpperCase()}
    </Badge>
  );
}
