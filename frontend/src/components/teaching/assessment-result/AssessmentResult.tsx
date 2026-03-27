/**
 * AssessmentResult Component
 *
 * Displays the overall pass/fail result with config-driven score breakdown.
 */

import { Alert, Card, Stack, ThemeIcon } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import Icon from "@/components/icons";
import { BodyText, BodyTextBold } from "@/components/typography";
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
      <Alert
        color={isPassed ? "green" : "red"}
        variant="light"
        icon={
          <ThemeIcon
            color={isPassed ? "green" : "red"}
            variant="filled"
            size="lg"
            radius="xl"
          >
            <Icon icon={isPassed ? <IconCheck /> : <IconX />} />
          </ThemeIcon>
        }
      >
        <BodyTextBold>{isPassed ? "Passed" : "Not passed"}</BodyTextBold>
        {bankTitle && <BodyText>{bankTitle}</BodyText>}
      </Alert>

      <Card withBorder p="md">
        <Stack gap="sm">
          <BodyTextBold>Score breakdown</BodyTextBold>
          <ScoreBreakdown criteria={criteria} />
        </Stack>
      </Card>
    </Stack>
  );
}
