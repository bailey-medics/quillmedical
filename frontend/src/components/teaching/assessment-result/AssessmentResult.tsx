/**
 * AssessmentResult Component
 *
 * Displays the overall pass/fail result with config-driven score breakdown.
 */

import { Alert, Card, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import Icon from "@/components/icons";
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
        <Title order={3}>{isPassed ? "Passed" : "Not passed"}</Title>
        {bankTitle && (
          <Text size="sm" mt={4}>
            {bankTitle}
          </Text>
        )}
      </Alert>

      <Card withBorder p="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Score breakdown
          </Text>
          <ScoreBreakdown criteria={criteria} />
        </Stack>
      </Card>
    </Stack>
  );
}
