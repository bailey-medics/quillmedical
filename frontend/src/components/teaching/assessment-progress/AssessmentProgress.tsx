/**
 * AssessmentProgress Component
 *
 * Progress bar showing question X of N (from config items_per_attempt).
 */

import { Group, Progress, Text } from "@mantine/core";

interface AssessmentProgressProps {
  /** Current question number (1-based) */
  current: number;
  /** Total number of questions */
  total: number;
}

export function AssessmentProgress({
  current,
  total,
}: AssessmentProgressProps) {
  const percentage = total > 0 ? ((current - 1) / total) * 100 : 0;

  return (
    <Group gap="sm" align="center">
      <Progress value={percentage} size="xl" style={{ flex: 1 }} />
      <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
        {current} of {total}
      </Text>
    </Group>
  );
}
