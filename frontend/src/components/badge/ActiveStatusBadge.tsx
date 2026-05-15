/**
 * ActiveStatus Badge Component
 *
 * Displays the active/inactive status of a resource (patient, user, etc.)
 * with appropriate colour coding and sizing.
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

type Props = {
  /** Whether the resource is active */
  active: boolean;
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

const STATUS_CONFIG: Record<
  "active" | "deactivated",
  { label: string; colour: BadgeColourConfig }
> = {
  active: { label: "Active", colour: badgeColours.success },
  deactivated: { label: "Deactivated", colour: badgeColours.outstanding },
};

export default function ActiveStatusBadge({
  active,
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  const { label, colour } = STATUS_CONFIG[active ? "active" : "deactivated"];

  return (
    <Badge color={colour.bg} c={colour.text} variant={BADGE_VARIANT}>
      {label}
    </Badge>
  );
}
