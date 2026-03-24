/**
 * AppointmentStatus Badge Component
 *
 * Displays appointment status with colour-coded filled badges
 * for clear visual distinction between upcoming, completed,
 * cancelled, and no-show states.
 */

import { Badge, Skeleton } from "@mantine/core";

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

const SKELETON_WIDTHS: Record<string, number> = {
  sm: 70,
  md: 80,
  lg: 95,
  xl: 115,
};

const SKELETON_HEIGHTS: Record<string, number> = {
  sm: 19,
  md: 21,
  lg: 27,
  xl: 40,
};

function getStatusColour(status: AppointmentStatusType): string {
  switch (status) {
    case "upcoming":
      return "blue";
    case "completed":
      return "green";
    case "cancelled":
      return "red";
    case "no-show":
      return "orange";
  }
}

function getStatusLabel(status: AppointmentStatusType): string {
  switch (status) {
    case "upcoming":
      return "Upcoming";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "no-show":
      return "No show";
  }
}

export default function AppointmentStatus({
  status,
  size = "lg",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return (
      <Skeleton
        width={SKELETON_WIDTHS[size] ?? 95}
        height={SKELETON_HEIGHTS[size] ?? 27}
        radius="xl"
      />
    );
  }

  return (
    <Badge color={getStatusColour(status)} variant="filled" size={size}>
      {getStatusLabel(status)}
    </Badge>
  );
}
