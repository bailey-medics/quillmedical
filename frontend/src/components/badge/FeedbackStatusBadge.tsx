/**
 * FeedbackStatus Badge Component
 *
 * Where a piece of feedback has got to, colour-coded so an operator can
 * pick out what is still `new` at a glance.
 */

import { Badge } from "@mantine/core";
import {
  FEEDBACK_STATUS_LABELS,
  type FeedbackStatus,
} from "@/lib/feedback/feedbackAdmin";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

type Props = {
  /** The feedback status to display */
  status: FeedbackStatus;
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

const STATUS_COLOURS: Record<FeedbackStatus, BadgeColourConfig> = {
  new: badgeColours.alert,
  acknowledged: badgeColours.warning,
  resolved: badgeColours.success,
  wont_fix: badgeColours.outstanding,
};

export default function FeedbackStatusBadge({
  status,
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  const colour = STATUS_COLOURS[status];

  return (
    <Badge color={colour.bg} c={colour.text} variant={BADGE_VARIANT}>
      {FEEDBACK_STATUS_LABELS[status]}
    </Badge>
  );
}
