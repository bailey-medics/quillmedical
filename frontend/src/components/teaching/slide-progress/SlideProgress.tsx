/**
 * SlideProgress Component
 *
 * Displays current slide position as a fraction (e.g. "5/23") with
 * a thin progress bar underneath. Pinned to the top of the slide reader.
 */

import { Group, Progress } from "@mantine/core";
import BodyText from "@/components/typography/BodyText";

export interface SlideProgressProps {
  /** Current slide index (1-based for display) */
  current: number;
  /** Total number of slides */
  total: number;
}

export default function SlideProgress({ current, total }: SlideProgressProps) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div>
      <Group justify="flex-end" mb={4}>
        <BodyText>
          {current}/{total}
        </BodyText>
      </Group>
      <Progress value={percentage} size="xs" aria-label="Slide progress" />
    </div>
  );
}
