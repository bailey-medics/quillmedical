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
  /**
   * How full to draw the bar, when that differs from `current`.
   *
   * Counting stages gives a bar that only moves in whole steps, which
   * reads as stuck during a long stage — a video upload sits on one
   * step for minutes. Pass a fractional position here to let the bar
   * creep while the count keeps to whole stages: `fill={0.42}` with
   * `current={0} total={4}` draws a tenth full and still counts zero
   * stages done.
   *
   * Omitted, the bar follows `current` exactly, as every counted use
   * of this component wants.
   */
  fill?: number;
  /**
   * Whether to print "X of N" beside the bar.
   *
   * On by default, because a reader moving through slides or questions
   * wants to know how many are left. Off where the stages are internal
   * machinery rather than something a person is working through: an
   * admin waiting on a video does not count in stages, and "0 of 4"
   * invites them to wonder what the four are.
   */
  showCount?: boolean;
}

export function TeachingProgressBar({
  current,
  total,
  fill,
  showCount = true,
}: TeachingProgressBarProps) {
  const position = fill ?? current;
  // Clamped, because the caller's arithmetic is not this component's
  // to trust: a percentage over 100 silently overflows the track.
  const percentage =
    total > 0 ? Math.min(100, Math.max(0, (position / total) * 100)) : 0;

  return (
    <Group gap="sm" align="center">
      <Progress value={percentage} size="xl" radius="xl" style={{ flex: 1 }} />
      {showCount && (
        <BodyText>
          {current} of {total}
        </BodyText>
      )}
    </Group>
  );
}
