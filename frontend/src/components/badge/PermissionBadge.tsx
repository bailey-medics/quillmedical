/**
 * PermissionBadge Component
 *
 * A specialized badge for displaying user system permission levels.
 * Enforces consistent styling and color mapping across the application.
 *
 * @example
 * ```tsx
 * <PermissionBadge permission="superadmin" />
 * <PermissionBadge permission="admin" />
 * <PermissionBadge permission="staff" variant="light" />
 * ```
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

export type UserPermission =
  | "superadmin"
  | "admin"
  | "staff"
  | "teaching_delegate"
  | "patient";
interface PermissionBadgeProps {
  /** System permission level */
  permission: UserPermission;
  /** Badge variant - defaults to light */
  variant?: "filled" | "light" | "outline" | "dot" | "default";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
}

const PERMISSION_CONFIG: Record<UserPermission, BadgeColourConfig> = {
  superadmin: badgeColours.info,
  admin: badgeColours.success,
  staff: badgeColours.neutral,
  teaching_delegate: badgeColours.accent,
  patient: badgeColours.alert,
};

const PERMISSION_LABELS: Record<UserPermission, string> = {
  superadmin: "SUPERADMIN",
  admin: "ADMIN",
  staff: "STAFF",
  teaching_delegate: "TEACHING DELEGATE",
  patient: "PATIENT",
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
  variant = BADGE_VARIANT,
  isLoading = false,
}: PermissionBadgeProps) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  if (!permission) {
    return null;
  }

  return (
    <Badge
      variant={variant}
      color={PERMISSION_CONFIG[permission].bg}
      c={PERMISSION_CONFIG[permission].text}
      radius="xl"
    >
      {PERMISSION_LABELS[permission]}
    </Badge>
  );
}
