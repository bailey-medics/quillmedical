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
}: CompetencySummaryProps) {
  // No loading state, deliberately. Skeletons stood here until the
  // fetch returned and were then replaced by one of two things: the
  // rows, or a fixed message saying nothing is recorded yet. For the
  // second — everyone's first visit — the panel changed shape for no
  // information at all: three grey bars in a card, then a differently
  // sized message in a different colour. That read as a flicker.
  //
  // An empty list renders the message straight away, which is right
  // whether the fetch has returned or not: it says the same words
  // either way. A list that arrives with rows in it replaces the
  // message once, which is a real change and worth seeing.
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
