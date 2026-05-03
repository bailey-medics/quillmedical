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
  /** Badge size (default: "md") */
  size?: "sm" | "md" | "lg" | "xl";
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
  size = "lg",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton size={size} />;
  }

  const { label, colour } = STATUS_CONFIG[active ? "active" : "deactivated"];

  return (
    <Badge
      color={colour.bg}
      c={colour.text}
      variant={BADGE_VARIANT}
      size={size}
    >
      {label}
    </Badge>
  );
}
