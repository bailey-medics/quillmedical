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
import { FEEDBACK_STATUS_SENDER_LABELS } from "@/lib/feedback/myFeedback";

type Props = {
  /** The feedback status to display */
  status: FeedbackStatus;
  /**
   * Who is reading: an operator sees the triage word, the sender sees
   * what it means for them (defaults to "operator")
   */
  audience?: "operator" | "sender";
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
  audience = "operator",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  const colour = STATUS_COLOURS[status];

  return (
    <Badge color={colour.bg} c={colour.text} variant={BADGE_VARIANT}>
      {audience === "sender"
        ? FEEDBACK_STATUS_SENDER_LABELS[status]
        : FEEDBACK_STATUS_LABELS[status]}
    </Badge>
  );
}
