/**
 * LetterStatus Badge Component
 *
 * Displays clinical letter status with colour-coded filled badges
 * for clear visual distinction between final, draft, and amended states.
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

export type LetterStatusType = "final" | "draft" | "amended";

type Props = {
  /** The letter status to display */
  status: LetterStatusType;
  /** Badge size (default: "lg") */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

const STATUS_CONFIG: Record<
  LetterStatusType,
  { label: string; colour: BadgeColourConfig }
> = {
  final: { label: "Final", colour: badgeColours.success },
  draft: { label: "Draft", colour: badgeColours.warning },
  amended: { label: "Amended", colour: badgeColours.info },
};

export default function LetterStatus({
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
