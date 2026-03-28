/**
 * AssessmentResult Component
 *
 * Displays the overall pass/fail result with config-driven score breakdown.
 */

import { Card, Stack } from "@mantine/core";
import { PageHeader, HeaderText } from "@/components/typography";
import ResultMessage from "@/components/result-message/ResultMessage";
import { ScoreBreakdown } from "../score-breakdown/ScoreBreakdown";
import type { CriterionResult } from "@/features/teaching/types";

interface AssessmentResultProps {
  /** Whether the candidate passed */
  isPassed: boolean;
  /** Per-criterion results */
  criteria: CriterionResult[];
  /** Question bank title */
  bankTitle?: string;
}

export function AssessmentResult({
  isPassed,
  criteria,
  bankTitle,
}: AssessmentResultProps) {
  return (
    <Stack gap="lg">
      <PageHeader title={isPassed ? "Passed" : "Not passed"} />

      <ResultMessage
        variant={isPassed ? "success" : "error"}
        title={isPassed ? "Passed" : "Not passed"}
        subtitle={bankTitle}
      />

      <Card withBorder p="md">
        <Stack gap="sm">
          <HeaderText>Score breakdown</HeaderText>
          <ScoreBreakdown criteria={criteria} />
        </Stack>
      </Card>
    </Stack>
  );
}
