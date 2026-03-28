/**
 * ScoreBreakdown Component
 *
 * Displays per-criterion pass/fail results from the assessment scoring.
 * Each criterion shows name, value vs threshold, and visual pass/fail.
 */

import { Group, Stack } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import Icon from "@/components/icons";
import { BodyText, BodyTextBlack, BodyTextBold } from "@/components/typography";
import AssessmentResultBadge from "@/components/badge/AssessmentResultBadge";
import type { CriterionResult } from "@/features/teaching/types";

interface ScoreBreakdownProps {
  /** List of criterion results */
  criteria: CriterionResult[];
}

export function ScoreBreakdown({ criteria }: ScoreBreakdownProps) {
  return (
    <Stack gap="sm">
      {criteria.map((c) => (
        <Group key={c.name} justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Icon
              icon={c.passed ? <IconCheck /> : <IconX />}
              size="sm"
              container={c.passed ? "green" : "red"}
            />
            <BodyTextBlack>{c.name}</BodyTextBlack>
          </Group>
          <Group gap="xs">
            <BodyTextBold>{(c.value * 100).toFixed(1)}%</BodyTextBold>
            <BodyText>/ {(c.threshold * 100).toFixed(0)}%</BodyText>
            <AssessmentResultBadge result={c.passed ? "pass" : "fail"} />
          </Group>
        </Group>
      ))}
    </Stack>
  );
}
