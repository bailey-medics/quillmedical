/**
 * ActiveStatus Badge Component
 *
 * Displays the active/inactive status of a resource (patient, user, etc.)
 * with appropriate colour coding and sizing.
 */

import { Badge, Skeleton } from "@mantine/core";

type Props = {
  /** Whether the resource is active */
  active: boolean;
  /** Badge size (default: "md") */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

const SKELETON_WIDTHS: Record<string, number> = {
  sm: 65,
  md: 75,
  lg: 90,
  xl: 110,
};

const SKELETON_HEIGHTS: Record<string, number> = {
  sm: 19,
  md: 21,
  lg: 27,
  xl: 40,
};

/**
 * ActiveStatus Badge
 *
 * Shows "Active" in green or "Deactivated" in red based on the active prop.
 * Larger than default badges for better visibility in admin tables.
 *
 * @example
 * ```tsx
 * <ActiveStatus active={true} />  // Shows green "Active"
 * <ActiveStatus active={false} /> // Shows red "Deactivated"
 * ```
 */
export default function ActiveStatus({
  active,
  size = "lg",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return (
      <Skeleton
        width={SKELETON_WIDTHS[size] ?? 90}
        height={SKELETON_HEIGHTS[size] ?? 27}
        radius="xl"
      />
    );
  }

  return (
    <Badge color={active ? "teal" : "pink"} variant="filled" size={size}>
      {active ? "Active" : "Deactivated"}
    </Badge>
  );
}
