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
  /** Badge size (default: "lg") */
  size?: "sm" | "md" | "lg" | "xl";
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
export default function AssessmentResultBadge({ result, size = "lg" }: Props) {
  const { label, color } = config[result];

  return (
    <Badge color={color} variant="filled" size={size}>
      {label}
    </Badge>
  );
}
