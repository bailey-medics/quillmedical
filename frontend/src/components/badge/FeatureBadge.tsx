/**
 * FeatureBadge Component
 *
 * Displays a feature name as a pill-shaped badge using the
 * warning colour from the design system.
 *
 * @example
 * ```tsx
 * <FeatureBadge label="Teaching" />
 * <FeatureBadge label="Messaging" size="md" />
 * ```
 */

import { Badge } from "@mantine/core";
import type { MantineSize } from "@mantine/core";
import { badgeColours, BADGE_VARIANT } from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

interface FeatureBadgeProps {
  /** Feature display name */
  label: string;
  /** Badge size — defaults to lg */
  size?: MantineSize;
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
}

/**
 * FeatureBadge displays a feature name with consistent
 * colour coding using the warning colour.
 */
export default function FeatureBadge({
  label,
  size = "lg",
  isLoading = false,
}: FeatureBadgeProps) {
  if (isLoading) {
    return <BadgeSkeleton size={size as "sm" | "md" | "lg" | "xl"} />;
  }

  return (
    <Badge
      size={size}
      variant={BADGE_VARIANT}
      color={badgeColours.alert.bg}
      c={badgeColours.alert.text}
      radius="xl"
    >
      {label}
    </Badge>
  );
}
