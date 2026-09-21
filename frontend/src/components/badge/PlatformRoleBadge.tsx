/**
 * PlatformRoleBadge Component
 *
 * Marks the people who operate Quill itself. Renders a SUPERADMIN pill
 * for an operator and nothing at all for anyone else.
 *
 * Showing only the rare case is deliberate. The alternative — a STANDARD
 * pill on every row of every user list — is noise that says nothing,
 * because almost nobody is an operator. The badge earns its org_unit by
 * appearing seldom.
 *
 * This replaces `PermissionBadge`, which rendered one of four rungs of
 * the `system_permissions` ladder. Three of those rungs described where
 * someone works rather than what they are, and moved to organisation and
 * site membership; see
 * docs/docs/plans/2026-09-09-platform-role-plan.md.
 *
 * @example
 * ```tsx
 * <PlatformRoleBadge platformRole="superadmin" />
 * <PlatformRoleBadge platformRole="standard" />
 * ```
 */

import { Badge } from "@mantine/core";
import { badgeColours, BADGE_VARIANT } from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

/** Whether someone operates Quill itself, or does not. */
export type PlatformRole = "superadmin" | "standard";

interface PlatformRoleBadgeProps {
  /** The person's platform role */
  platformRole: PlatformRole | undefined;
  /** Badge variant - defaults to light */
  variant?: "filled" | "light" | "outline" | "dot" | "default";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
}

/**
 * PlatformRoleBadge displays whether someone operates Quill itself.
 *
 * Renders nothing for a standard account, and nothing for a missing or
 * unrecognised value — a badge that cannot say something true says
 * nothing.
 */
export default function PlatformRoleBadge({
  platformRole,
  variant = BADGE_VARIANT,
  isLoading = false,
}: PlatformRoleBadgeProps) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  if (platformRole !== "superadmin") {
    return null;
  }

  return (
    <Badge
      variant={variant}
      color={badgeColours.info.bg}
      c={badgeColours.info.text}
      radius="xl"
    >
      SUPERADMIN
    </Badge>
  );
}
