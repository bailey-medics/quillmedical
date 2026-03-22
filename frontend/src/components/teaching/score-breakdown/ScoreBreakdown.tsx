/**
 * ScoreBreakdown Component
 *
 * Displays per-criterion pass/fail results from the assessment scoring.
 * Each criterion shows name, value vs threshold, and visual pass/fail.
 */

import { Badge, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import Icon from "@/components/icons";
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
            <ThemeIcon
              color={c.passed ? "green" : "red"}
              variant="light"
              size="sm"
              radius="xl"
            >
              <Icon icon={c.passed ? <IconCheck /> : <IconX />} size="sm" />
            </ThemeIcon>
            <Text size="sm">{c.name}</Text>
          </Group>
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {(c.value * 100).toFixed(1)}%
            </Text>
            <Text size="xs" c="dimmed">
              / {(c.threshold * 100).toFixed(0)}%
            </Text>
            <Badge size="xs" color={c.passed ? "green" : "red"} variant="light">
              {c.passed ? "Pass" : "Fail"}
            </Badge>
          </Group>
        </Group>
      ))}
    </Stack>
  );
}
