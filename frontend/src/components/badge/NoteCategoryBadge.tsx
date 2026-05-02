/**
 * NoteCategoryBadge Component
 *
 * Displays clinical note category with colour-coded filled badges
 * for clear visual distinction between consultation, telephone,
 * observation, and procedure notes.
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

export type NoteCategoryType =
  | "consultation"
  | "telephone"
  | "observation"
  | "procedure";

type Props = {
  /** The note category to display */
  category: NoteCategoryType;
  /** Badge size (default: "lg") */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

const CATEGORY_CONFIG: Record<
  NoteCategoryType,
  { label: string; colour: BadgeColourConfig }
> = {
  consultation: { label: "Consultation", colour: badgeColours.info },
  telephone: { label: "Telephone", colour: badgeColours.accent },
  observation: { label: "Observation", colour: badgeColours.success },
  procedure: { label: "Procedure", colour: badgeColours.warning },
};

export default function NoteCategoryBadge({
  category,
  size = "lg",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton size={size} />;
  }

  const { label, colour } = CATEGORY_CONFIG[category];

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
