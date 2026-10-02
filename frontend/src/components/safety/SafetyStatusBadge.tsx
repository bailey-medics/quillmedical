/**
 * SafetyStatusBadge Component
 *
 * Where a safety case stands: draft, in review or signed off. Part of
 * the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Separate from `SignOffStatusBadge`, which is a passport sign-off by a
 * named assessor. A safety case being signed off is the case as a whole
 * being approved, and the two vocabularies must not be confused.
 *
 * @example
 * ```tsx
 * <SafetyStatusBadge status="in_review" />  // "In review"
 * ```
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "@/components/badge/badgeColours";
import type { SafetyCaseStatus } from "@lib/safety";

type Props = {
  /** Where the case stands */
  status: SafetyCaseStatus;
};

const STATUS_CONFIG: Record<
  SafetyCaseStatus,
  { label: string; colour: BadgeColourConfig }
> = {
  draft: { label: "Draft", colour: badgeColours.neutral },
  in_review: { label: "In review", colour: badgeColours.warning },
  signed_off: { label: "Signed off", colour: badgeColours.success },
};

export default function SafetyStatusBadge({ status }: Props) {
  const { label, colour } = STATUS_CONFIG[status];
  return (
    <Badge color={colour.bg} c={colour.text} variant={BADGE_VARIANT}>
      {label}
    </Badge>
  );
}
