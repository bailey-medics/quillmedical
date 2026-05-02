/**
 * AssessmentResultBadge Component
 *
 * Displays the result of a teaching assessment (pass, fail, or incomplete)
 * with appropriate colour coding.
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

type AssessmentResult = "pass" | "fail" | "incomplete";

type Props = {
  /** Assessment result */
  result: AssessmentResult;
  /** Badge size (default: "lg") */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

const STATUS_CONFIG: Record<
  AssessmentResult,
  { label: string; colour: BadgeColourConfig }
> = {
  pass: { label: "Pass", colour: badgeColours.success },
  fail: { label: "Fail", colour: badgeColours.alert },
  incomplete: { label: "Incomplete", colour: badgeColours.accent },
};

/**
 * AssessmentResultBadge
 *
 * Shows a coloured badge for teaching assessment results.
 *
 * @example
 * ```tsx
 * <AssessmentResultBadge result="pass" />       // Green "Pass"
 * <AssessmentResultBadge result="fail" />        // Red "Fail"
 * <AssessmentResultBadge result="incomplete" />  // Violet "Incomplete"
 * ```
 */
export default function AssessmentResultBadge({
  result,
  size = "lg",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton size={size} />;
  }

  const { label, colour } = STATUS_CONFIG[result];

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
