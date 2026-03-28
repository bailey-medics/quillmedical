/**
 * AssessmentTimer Component
 *
 * Countdown timer for timed assessments. Calculates remaining time from
 * the startedAt timestamp and the config-driven time limit.
 *
 * Colour states:
 * - Blue: normal — more than 5 minutes remaining
 * - Orange: warning — 5 minutes or less remaining
 * - Red: critical — 1 minute or less remaining, or expired ("Time up")
 *
 * Calls onExpire when the countdown reaches zero.
 */

import { Badge, Group, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import Icon from "@/components/icons";
import { IconClock } from "@tabler/icons-react";

interface AssessmentTimerProps {
  /** Total time limit in minutes */
  timeLimitMinutes: number;
  /** When the assessment started (ISO string) */
  startedAt: string;
  /** Called when time expires */
  onExpire: () => void;
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function AssessmentTimer({
  timeLimitMinutes,
  startedAt,
  onExpire,
}: AssessmentTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    const elapsed = Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000,
    );
    return Math.max(0, timeLimitMinutes * 60 - elapsed);
  });

  useEffect(() => {
    if (remainingSeconds <= 0) {
      onExpire();
      return;
    }

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          onExpire();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [remainingSeconds, onExpire]);

  const isExpired = remainingSeconds <= 0;
  const isCritical = remainingSeconds > 0 && remainingSeconds <= 60;
  const isWarning = remainingSeconds > 60 && remainingSeconds <= 300;

  const colour =
    isExpired || isCritical ? "red" : isWarning ? "orange" : "blue";

  return (
    <Badge
      size="xl"
      variant="filled"
      color={colour}
      leftSection={<Icon icon={<IconClock />} size="sm" />}
    >
      <Group gap={4}>
        <Text size="lg" fw={600}>
          {isExpired ? "Time up" : formatTime(remainingSeconds)}
        </Text>
      </Group>
    </Badge>
  );
}
