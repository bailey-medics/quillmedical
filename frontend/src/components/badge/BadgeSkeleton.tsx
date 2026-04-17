/**
 * Badge Skeleton
 *
 * Shared loading skeleton for all badge components (except UnreadBadge).
 * Provides consistent sizing across all badge types.
 */

import { Skeleton } from "@mantine/core";

export type BadgeSize = "sm" | "md" | "lg" | "xl";

const SKELETON_WIDTHS: Record<BadgeSize, number> = {
  sm: 65,
  md: 75,
  lg: 90,
  xl: 110,
};

const SKELETON_HEIGHTS: Record<BadgeSize, number> = {
  sm: 19,
  md: 21,
  lg: 27,
  xl: 32,
};

type Props = {
  /** Badge size */
  size: BadgeSize;
};

export default function BadgeSkeleton({ size }: Props) {
  return (
    <Skeleton
      width={SKELETON_WIDTHS[size]}
      height={SKELETON_HEIGHTS[size]}
      radius="xl"
    />
  );
}
