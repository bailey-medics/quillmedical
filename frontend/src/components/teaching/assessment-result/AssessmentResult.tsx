/**
 * AssessmentResult Component
 *
 * Displays the overall pass/fail result with config-driven score breakdown,
 * optional certificate download, and navigation buttons.
 */

import { Button, Group, Stack } from "@mantine/core";
import { PageHeader } from "@/components/typography";
import { ResultMessage } from "@/components/message-cards";
import ActionCard from "@/components/action-card/ActionCard";
import { ScoreBreakdown } from "../score-breakdown/ScoreBreakdown";
import type { CriterionResult } from "@/features/teaching/types";

interface AssessmentResultProps {
  /** Whether the candidate passed */
  isPassed: boolean;
  /** Per-criterion results */
  criteria: CriterionResult[];
  /** Question bank title */
  bankTitle?: string;
  /** Assessment ID — required when showCertificate is true */
  assessmentId?: number;
  /** Show certificate download section */
  showCertificate?: boolean;
  /** Show "Try again" button (only when failed and retry allowed) */
  showTryAgain?: boolean;
  /** Show "Back to dashboard" button */
  showBackToDashboard?: boolean;
  /** Called when "Try again" is clicked */
  onTryAgain?: () => void;
  /** Called when "Back to dashboard" is clicked */
  onBackToDashboard?: () => void;
}

export function AssessmentResult({
  isPassed,
  criteria,
  bankTitle,
  assessmentId,
  showCertificate = false,
  showTryAgain = false,
  showBackToDashboard = false,
  onTryAgain,
  onBackToDashboard,
}: AssessmentResultProps) {
  async function handleDownload() {
    if (!assessmentId) return;
    try {
      const res = await fetch(
        `/api/teaching/assessments/${assessmentId}/certificate`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${assessmentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download certificate:", err);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title={isPassed ? "Passed" : "Not passed"} />

      <ResultMessage
        variant={isPassed ? "success" : "fail"}
        title={isPassed ? "Passed" : "Not passed"}
        subtitle={bankTitle}
      />

      <ScoreBreakdown criteria={criteria} />

      {showCertificate && assessmentId && (
        <ActionCard
          title="Certificate"
          subtitle="You have passed this assessment. Download your certificate below as a PDF to keep for your records."
          buttonLabel="Download certificate"
          onClick={handleDownload}
          fullWidth
          buttonVariant="filled"
        />
      )}

      {(showTryAgain || showBackToDashboard) && (
        <Group justify="flex-end">
          {showTryAgain && (
            <Button variant="light" size="lg" onClick={onTryAgain}>
              Try again
            </Button>
          )}
          {showBackToDashboard && (
            <Button size="lg" onClick={onBackToDashboard}>
              Back to dashboard
            </Button>
          )}
        </Group>
      )}
    </Stack>
  );
}
