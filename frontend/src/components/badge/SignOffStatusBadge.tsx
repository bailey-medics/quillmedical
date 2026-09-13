/**
 * SignOffStatusBadge Component
 *
 * Displays where a passport sign-off stands: requested, signed off,
 * declined or superseded.
 *
 * Deliberately separate from `AssessmentResultBadge`, which carries a
 * teaching assessment's pass/fail. A clinical sign-off is a named person
 * accepting accountability for a judgement, and borrowing "Pass" for it
 * would blur two things the passport keeps visibly apart.
 *
 * Also separate from `CompetencyBadge`, which carries a competency's
 * *name* rather than the state of anything.
 *
 * @example
 * ```tsx
 * <SignOffStatusBadge status="signed_off" />  // Green "Signed off"
 * <SignOffStatusBadge status="requested" />   // Yellow "Requested"
 * ```
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

type SignOffStatus = "requested" | "signed_off" | "declined" | "superseded";

type Props = {
  /** Where the sign-off stands */
  status: SignOffStatus;
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

/**
 * `declined` uses outstanding rather than alert. A decline is an ordinary
 * part of the record — an assessor saying "not yet" — not an error, and
 * red would read as one. `superseded` is neutral because the record is
 * still valid history; it has simply been corrected by a later one.
 */
const STATUS_CONFIG: Record<
  SignOffStatus,
  { label: string; colour: BadgeColourConfig }
> = {
  requested: { label: "Requested", colour: badgeColours.warning },
  signed_off: { label: "Signed off", colour: badgeColours.success },
  declined: { label: "Declined", colour: badgeColours.outstanding },
  superseded: { label: "Superseded", colour: badgeColours.neutral },
};

/**
 * SignOffStatusBadge
 *
 * Shows a coloured badge for a sign-off's current status.
 */
export default function SignOffStatusBadge({
  status,
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  const { label, colour } = STATUS_CONFIG[status];

  return (
    <Badge color={colour.bg} c={colour.text} variant={BADGE_VARIANT}>
      {label}
    </Badge>
  );
}
