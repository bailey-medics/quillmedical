/**
 * CompetencyBadge Component
 *
 * Displays a competency name as a pill-shaped badge using the
 * info colour from the design system.
 *
 * @example
 * ```tsx
 * <CompetencyBadge label="Take Teaching Assessments" />
 * <CompetencyBadge label="Manage Teaching Content" removed />
 * ```
 */

import { Badge } from "@mantine/core";
import { badgeColours, BADGE_VARIANT } from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

interface CompetencyBadgeProps {
  /** Competency display name */
  label: string;
  /** Whether this competency has been removed (uses alert colour) */
  removed?: boolean;
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
}

/**
 * CompetencyBadge displays a competency name with consistent
 * colour coding. Uses info colour by default, or alert colour
 * when marked as removed.
 */
export default function CompetencyBadge({
  label,
  removed = false,
  isLoading = false,
}: CompetencyBadgeProps) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  const colours = removed ? badgeColours.alert : badgeColours.info;

  return (
    <Badge
      variant={BADGE_VARIANT}
      color={colours.bg}
      c={colours.text}
      radius="xl"
    >
      {label}
    </Badge>
  );
}
