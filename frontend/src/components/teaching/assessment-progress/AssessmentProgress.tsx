/**
 * AssessmentProgress Component
 *
 * Progress bar showing question X of N (from config items_per_attempt).
 */

import { Group, Progress } from "@mantine/core";
import { BodyText } from "@/components/typography";

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
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <Group gap="sm" align="center">
      <Progress value={percentage} size="xl" radius="xl" style={{ flex: 1 }} />
      <BodyText>
        {current} of {total}
      </BodyText>
    </Group>
  );
}
