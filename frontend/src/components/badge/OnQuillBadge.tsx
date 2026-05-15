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
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

export default function OnQuillBadge({ isLoading = false }: Props) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  const colour = badgeColours.info;

  return (
    <Badge
      color={colour.bg}
      c={colour.text}
      variant={BADGE_VARIANT}
      styles={{ label: { textTransform: "none" } }}
    >
      on Quill
    </Badge>
  );
}
