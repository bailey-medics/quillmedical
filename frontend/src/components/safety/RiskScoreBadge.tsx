/**
 * RiskScoreBadge Component
 *
 * A DCB0129 risk rating as a coloured badge: the product of a likelihood
 * and a severity, each 1 to 5, so 1 to 25. Coloured low to high through
 * the badge palette so a hazard log can be read at a glance. Part of the
 * safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * The bands follow the usual DCB0129 reading of the matrix: 1 to 2 is
 * acceptable, 3 to 4 is tolerable with review, 6 to 9 is undesirable,
 * 10 and above is unacceptable without mitigation.
 *
 * @example
 * ```tsx
 * <RiskScoreBadge likelihood={3} severity={5} />  // "15"
 * ```
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "@/components/badge/badgeColours";
import { riskBand, riskRating, type RiskScore } from "@lib/safety";

type Props = {
  likelihood: RiskScore;
  severity: RiskScore;
};

const BAND_COLOUR: Record<ReturnType<typeof riskBand>, BadgeColourConfig> = {
  acceptable: badgeColours.success,
  tolerable: badgeColours.neutral,
  undesirable: badgeColours.warning,
  unacceptable: badgeColours.alert,
};

function colourFor(rating: number): BadgeColourConfig {
  return BAND_COLOUR[riskBand(rating)];
}

export default function RiskScoreBadge({ likelihood, severity }: Props) {
  const rating = riskRating(likelihood, severity);
  const colour = colourFor(rating);
  return (
    <Badge
      color={colour.bg}
      c={colour.text}
      variant={BADGE_VARIANT}
      aria-label={`Risk rating ${rating}: likelihood ${likelihood}, severity ${severity}`}
    >
      {rating}
    </Badge>
  );
}
