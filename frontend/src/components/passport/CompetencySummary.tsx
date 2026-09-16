/**
 * CompetencySummary Component
 *
 * Every competency a passport holds evidence for, as a list of rows.
 *
 * This answers the question asked ninety-nine times out of a hundred — is
 * this person signed off — and leaves the detail beneath it to the pages
 * that need it.
 *
 * It counts and never totals. There is no "12 of 20 complete", no
 * progress bar and no percentage, because a passport is not a defined set
 * of competencies: membership is local policy, and a denominator would
 * invent one. See the plan's decision on counting without comparing.
 *
 * @example
 * ```tsx
 * <CompetencySummary competencies={detail.competencies} onSelect={open} />
 * ```
 */

import { Stack } from "@mantine/core";
import { Skeleton } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import { Heading } from "@/components/typography";
import Divider from "@/components/divider/Divider";
import CompetencyRow from "./CompetencyRow";
import type { CompetencyState } from "@lib/passport";

export interface CompetencySummaryProps {
  /** Every competency the passport holds evidence for */
  competencies: CompetencyState[];
  /** Called when a competency is chosen */
  onSelect?: (competencyId: string) => void;
  /** Optional card heading */
  title?: string;
  /** Show loading skeletons instead of rows */
  isLoading?: boolean;
}

/**
 * CompetencySummary
 *
 * Renders the competency rows in a card, or an empty state when the
 * passport holds nothing yet.
 */
export default function CompetencySummary({
  competencies,
  onSelect,
  title = "Competencies",
  isLoading = false,
}: CompetencySummaryProps) {
  if (isLoading) {
    return (
      <BaseCard data-testid="competency-summary">
        <Stack gap="md">
          <Heading>{title}</Heading>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </Stack>
      </BaseCard>
    );
  }

  if (competencies.length === 0) {
    return (
      <StateMessage
        colour="update"
        icon={<IconFileText />}
        title="No competencies yet"
        description="Competencies appear here once you have a sign-off, a logbook entry or a certificate against one."
      />
    );
  }

  return (
    <BaseCard data-testid="competency-summary">
      <Stack gap="xs">
        <Heading>{title}</Heading>
        {competencies.map((competency, index) => (
          <Stack key={competency.id} gap="xs">
            {index > 0 && <Divider />}
            <CompetencyRow competency={competency} onSelect={onSelect} />
          </Stack>
        ))}
      </Stack>
    </BaseCard>
  );
}
