/**
 * AssessmentResult Component
 *
 * Displays the overall pass/fail result with config-driven score breakdown,
 * optional certificate download, an optional card linking to the results
 * question by question, and navigation buttons.
 */

import { Stack } from "@mantine/core";
import { PageHeader } from "@/components/typography";
import { ResultMessage } from "@/components/message-cards";
import ActionCard from "@/components/action-card/ActionCard";
import { ButtonPair } from "@/components/button";
import { ScoreBreakdown } from "../score-breakdown/ScoreBreakdown";
import { api } from "@/lib/api";
import type { CriterionResult } from "@/features/teaching/types";

interface AssessmentResultProps {
  /** Whether the candidate passed */
  isPassed: boolean;
  /** Per-criterion results */
  criteria: CriterionResult[];
  /** Question bank title */
  bankTitle?: string;
  /** Assessment ID - required when showCertificate is true */
  assessmentId?: number;
  /** Where the results question by question are; no link when omitted */
  questionResultsHref?: string;
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
  questionResultsHref,
  showCertificate = false,
  showTryAgain = false,
  showBackToDashboard = false,
  onTryAgain,
  onBackToDashboard,
}: AssessmentResultProps) {
  async function handleDownload() {
    if (!assessmentId) return;
    try {
      const blob = await api.blob(
        `/teaching/assessments/${assessmentId}/certificate`,
      );
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

      {questionResultsHref && (
        <ActionCard
          title="Results by question"
          subtitle="See how you did on each question in this attempt."
          buttonLabel="View results by question"
          buttonUrl={questionResultsHref}
          fullWidth
          buttonVariant="filled"
        />
      )}

      {(showTryAgain || showBackToDashboard) && (
        <ButtonPair
          acceptLabel="Back to dashboard"
          onAccept={showBackToDashboard ? onBackToDashboard : undefined}
          cancelLabel="Try again"
          onCancel={showTryAgain ? onTryAgain : undefined}
        />
      )}
    </Stack>
  );
}
