/**
 * AssessmentResultBadge Component
 *
 * Displays the result of a teaching assessment (pass, fail, or incomplete)
 * with appropriate colour coding.
 */

import { Badge } from "@mantine/core";

type AssessmentResult = "pass" | "fail" | "incomplete";

type Props = {
  /** Assessment result */
  result: AssessmentResult;
  /** Badge size (default: "sm") */
  size?: "sm" | "md" | "lg" | "xl";
};

const config: Record<AssessmentResult, { label: string; color: string }> = {
  pass: { label: "Pass", color: "green" },
  fail: { label: "Fail", color: "red" },
  incomplete: { label: "Incomplete", color: "gray" },
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
 * <AssessmentResultBadge result="incomplete" />  // Grey "Incomplete"
 * ```
 */
export default function AssessmentResultBadge({ result, size = "sm" }: Props) {
  const { label, color } = config[result];

  return (
    <Badge color={color} variant="light" size={size}>
      {label}
    </Badge>
  );
}
