/**
 * AssessmentQuestionResultsPage
 *
 * A finished assessment's results question by question, for audit. Each
 * question is named by its number in the question bank, not the shuffled
 * position it was shown at, and the bank version the attempt was sat
 * against is shown above the table with the percentage scored on each
 * pass criterion. Reads nothing from location state, so
 * a reload or a bookmarked link rebuilds it from the URL alone.
 */

import { Skeleton, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import TeachingMainNav from "@/components/navigation/teaching/TeachingMainNav";
import { StateMessage } from "@/components/message-cards";
import { IconAlertCircle } from "@/components/icons/appIcons";
import { BodyText, Heading, PageHeader } from "@/components/typography";
import { QuestionResultsTable } from "@/components/teaching/question-results-table";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { AssessmentQuestionResults } from "@/features/teaching/types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One decimal place, as the score breakdown on the result page shows it. */
function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function outcomeLabel(isPassed: boolean | null): string {
  if (isPassed === null) return "Incomplete";
  return isPassed ? "Passed" : "Not passed";
}

export default function AssessmentQuestionResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [results, setResults] = useState<AssessmentQuestionResults | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setResults(
          await api.get<AssessmentQuestionResults>(
            `/teaching/assessments/${id}/question-results`,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Where this page sits in the menu: under the result it breaks down,
  // which sits under its module. Shown only while the page is open.
  const sidebarNav = (
    <TeachingMainNav
      moduleName={results?.bank_title ?? undefined}
      moduleHref={results ? `/teaching/${results.question_bank_id}` : undefined}
      trail={[
        { label: "Result", href: `/teaching/assessment/${id}/result` },
        {
          label: "Results by question",
          href: `/teaching/assessment/${id}/question-results`,
        },
      ]}
    />
  );

  if (loading) {
    return (
      <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
        <Stack gap="lg">
          <PageHeader title="Results by question" />
          <Skeleton height={120} />
          <QuestionResultsTable questions={[]} loading />
        </Stack>
      </TeachingLayout>
    );
  }

  if (error || !results) {
    return (
      <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading data"
          description={error ?? "Assessment not found"}
          colour="alert"
        />
      </TeachingLayout>
    );
  }

  return (
    <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
      <Stack gap="lg">
        <PageHeader title="Results by question" />
        <BaseCard>
          <Stack gap="xs">
            {results.bank_title && <BodyText>{results.bank_title}</BodyText>}
            <BodyText>Question bank version: {results.bank_version}</BodyText>
            {results.exam_ref && (
              <BodyText>Exam reference: {results.exam_ref}</BodyText>
            )}
            <BodyText>
              Completed: {formatDateTime(results.completed_at)}
            </BodyText>
            <BodyText>Overall: {outcomeLabel(results.is_passed)}</BodyText>
            {/* Absent from a backend older than this page, mid-deploy */}
            {(results.criteria ?? []).map((c) => (
              <BodyText key={c.name}>
                {c.name}: {formatPercentage(c.value)}
              </BodyText>
            ))}
          </Stack>
        </BaseCard>
        {/* The table lists questions as the bank stores them. Each
            attempt shows them in its own shuffled order, so a learner
            reading down the table would otherwise look for the order
            they met them in. */}
        <Stack gap="xs">
          <Heading>Questions</Heading>
          <BodyText>
            The results below are in the order the questions are stored, not the
            order in which you saw them in the assessment.
          </BodyText>
        </Stack>
        <QuestionResultsTable questions={results.questions} />
      </Stack>
    </TeachingLayout>
  );
}
