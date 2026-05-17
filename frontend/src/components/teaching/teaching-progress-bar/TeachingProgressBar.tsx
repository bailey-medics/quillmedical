/**
 * TeachingProgressBar Component
 *
 * Progress bar showing current position as "X of N" with a
 * rounded bar. Used in assessments, slide readers, and the
 * learning nav sidebar.
 */

import { Group, Progress } from "@mantine/core";
import { BodyText } from "@/components/typography";

interface TeachingProgressBarProps {
  /** Current position (1-based) */
  current: number;
  /** Total number of items */
  total: number;
}

export function TeachingProgressBar({
  current,
  total,
}: TeachingProgressBarProps) {
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
