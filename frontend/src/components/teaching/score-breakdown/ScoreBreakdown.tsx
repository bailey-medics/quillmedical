/**
 * ScoreBreakdown Component
 *
 * Displays per-criterion pass/fail results from the assessment scoring.
 * Each criterion shows name, value vs threshold, and a visual pass/fail
 * indicator using PassIcon/FailIcon badges alongside an AssessmentResultBadge.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  HeaderText,
} from "@/components/typography";
import AssessmentResultBadge from "@/components/badge/AssessmentResultBadge";
import PassIcon from "@/components/badge/PassIcon";
import FailIcon from "@/components/badge/FailIcon";
import type { CriterionResult } from "@/features/teaching/types";

interface ScoreBreakdownProps {
  /** Assessment criteria results to display */
  criteria: CriterionResult[];
}

/**
 * Renders a card with per-criterion pass/fail breakdown.
 *
 * @param props - Component props
 * @returns Score breakdown card
 */
export function ScoreBreakdown({ criteria }: ScoreBreakdownProps) {
  return (
    <BaseCard>
      <Stack gap="sm">
        <HeaderText>Score breakdown</HeaderText>
        {criteria.map((c) => (
          <Group key={c.name} justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              {c.passed ? <PassIcon /> : <FailIcon />}
              <BodyTextInline>{c.name}</BodyTextInline>
            </Group>
            <Group gap="xs">
              <BodyTextBold>{(c.value * 100).toFixed(1)}%</BodyTextBold>
              <BodyText>/ {(c.threshold * 100).toFixed(0)}%</BodyText>
              <AssessmentResultBadge result={c.passed ? "pass" : "fail"} />
            </Group>
          </Group>
        ))}
      </Stack>{" "}
    </BaseCard>
  );
}
