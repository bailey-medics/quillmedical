/**
 * AssessmentResultBadge Component
 *
 * Displays the result of a teaching assessment (pass, fail, or incomplete)
 * with appropriate colour coding.
 */

import { Badge, Skeleton } from "@mantine/core";

type AssessmentResult = "pass" | "fail" | "incomplete";

type Props = {
  /** Assessment result */
  result: AssessmentResult;
  /** Badge size (default: "lg") */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

const SKELETON_WIDTHS: Record<string, number> = {
  sm: 70,
  md: 80,
  lg: 95,
  xl: 115,
};

const SKELETON_HEIGHTS: Record<string, number> = {
  sm: 19,
  md: 21,
  lg: 27,
  xl: 40,
};

const config: Record<AssessmentResult, { label: string; color: string }> = {
  pass: { label: "Pass", color: "green.5" },
  fail: { label: "Fail", color: "red.5" },
  incomplete: { label: "Incomplete", color: "violet.4" },
};

/**
 * AssessmentResultBadge
 *
 * Shows a coloured badge for teaching assessment results.
 *
 * @example
 * ```tsx
 * <AssessmentResultBadge result="pass" />       // Green "Pass"
 * <AssessmentResultBadge result="fail" />        // Red "Fail"
 * <AssessmentResultBadge result="incomplete" />  // Violet "Incomplete"
 * ```
 */
export default function AssessmentResultBadge({
  result,
  size = "lg",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return (
      <Skeleton
        width={SKELETON_WIDTHS[size] ?? 95}
        height={SKELETON_HEIGHTS[size] ?? 27}
        radius="xl"
      />
    );
  }

  const { label, color } = config[result];

  return (
    <Badge color={color} variant="filled" size={size}>
      {label}
    </Badge>
  );
}
