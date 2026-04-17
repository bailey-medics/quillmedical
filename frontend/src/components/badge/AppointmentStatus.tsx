/**
 * AppointmentStatus Badge Component
 *
 * Displays appointment status with colour-coded filled badges
 * for clear visual distinction between upcoming, completed,
 * cancelled, and no-show states.
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

export type AppointmentStatusType =
  | "upcoming"
  | "completed"
  | "cancelled"
  | "no-show";

type Props = {
  /** The appointment status to display */
  status: AppointmentStatusType;
  /** Badge size (default: "lg") */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

const STATUS_CONFIG: Record<
  AppointmentStatusType,
  { label: string; colour: BadgeColourConfig }
> = {
  upcoming: { label: "Upcoming", colour: badgeColours.info },
  completed: { label: "Completed", colour: badgeColours.success },
  cancelled: { label: "Cancelled", colour: badgeColours.outstanding },
  "no-show": { label: "No show", colour: badgeColours.alert },
};

export default function AppointmentStatus({
  status,
  size = "lg",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton size={size} />;
  }

  const { label, colour } = STATUS_CONFIG[status];

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
