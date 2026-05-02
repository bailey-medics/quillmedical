/**
 * OnQuillBadge Component
 *
 * Displays an "On Quill" indicator badge using the primary brand colour
 * with white text. Used in patient lists to mark patients registered
 * on the Quill platform.
 */

import { Badge } from "@mantine/core";
import { badgeColours, BADGE_VARIANT } from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

type Props = {
  /** Badge size (default: "lg") */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

export default function OnQuillBadge({
  size = "lg",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton size={size} />;
  }

  const colour = badgeColours.info;

  return (
    <Badge
      color={colour.bg}
      c={colour.text}
      variant={BADGE_VARIANT}
      size={size}
      styles={{ label: { textTransform: "none" } }}
    >
      on Quill
    </Badge>
  );
}
