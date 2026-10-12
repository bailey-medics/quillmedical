/**
 * AssessmentTimer Component
 *
 * Countdown timer for timed assessments. It is told how many seconds are
 * left, a figure that comes from the server, and counts down from there.
 *
 * The time shown is worked out afresh on every tick, from how long it is
 * since the figure arrived, and not by taking one off a running count. A
 * browser slows the ticks of a tab nobody is looking at, and a count
 * kept that way falls behind; this shows the right time the moment it
 * ticks again. The stopwatch is the browser's steady one,
 * `performance.now()`, so the computer's own clock is never read: one
 * that is wrong, or is corrected part way through, changes nothing.
 *
 * Colour states:
 * - Blue: normal - more than 5 minutes remaining
 * - Orange: warning - 5 minutes or less remaining
 * - Red: critical - 1 minute or less remaining, or expired ("Time up")
 *
 * Calls onExpire once when the countdown reaches zero.
 */

import { Badge, Group, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/icons";
import { IconClock } from "@/components/icons/appIcons";
import { statusTextColour } from "@/styles/semanticColours";

/** How often the time shown is worked out again, in milliseconds */
const TICK_MS = 250;

interface AssessmentTimerProps {
  /** Whole seconds left when the figure arrived */
  secondsLeft: number;
  /**
   * When the figure arrived, as `performance.now()` read at that moment.
   * A new figure with a new reading sets the countdown afresh. Left out,
   * the countdown runs from when the timer first showed.
   */
  receivedAt?: number;
  /** Called once when time expires */
  onExpire: () => void;
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function AssessmentTimer({
  secondsLeft,
  receivedAt,
  onExpire,
}: AssessmentTimerProps) {
  const [firstShownAt] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const toldRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(performance.now()), TICK_MS);

    return () => clearInterval(interval);
  }, []);

  // A figure can arrive a moment after the last tick, so the time since
  // is never taken as less than nothing
  const since = receivedAt ?? firstShownAt;
  const secondsGone = Math.floor(Math.max(0, now - since) / 1000);
  const remainingSeconds = Math.max(0, secondsLeft - secondsGone);
  const isExpired = remainingSeconds <= 0;

  useEffect(() => {
    // A fresh figure with time on it means the next nought is a new one
    if (!isExpired) {
      toldRef.current = false;
      return;
    }

    if (toldRef.current) return;

    toldRef.current = true;
    onExpire();
  }, [isExpired, onExpire]);

  const isCritical = remainingSeconds > 0 && remainingSeconds <= 60;
  const isWarning = remainingSeconds > 60 && remainingSeconds <= 300;

  const colour =
    isExpired || isCritical
      ? "var(--alert-color)"
      : isWarning
        ? "var(--neutral-color)"
        : "var(--info-color)";

  // The yellow warning fill takes dark text; white on it is 1.4:1.
  const textColour = isWarning ? statusTextColour("neutral") : "white";

  return (
    <Badge
      size="xl"
      variant="filled"
      color={colour}
      c={textColour}
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
