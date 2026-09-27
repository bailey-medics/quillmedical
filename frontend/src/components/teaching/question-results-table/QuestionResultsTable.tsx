/**
 * QuestionResultsTable Component
 *
 * One row per question of a finished assessment, in the order of the
 * question bank rather than the shuffled order it was shown in, with
 * whether each was passed. For audit, so the correct option is never
 * shown: only the outcome.
 */

import AssessmentResultBadge from "@components/badge/AssessmentResultBadge";
import DataTable, { type Column } from "@components/tables/DataTable";
import type { AssessmentQuestionResult } from "@/features/teaching/types";
import { questionLabel } from "./questionLabel";

interface QuestionResultsTableProps {
  /** The attempt's questions, already in question bank order */
  questions: AssessmentQuestionResult[];
  /** Show loading skeleton rows */
  loading?: boolean;
  /** Error message shown in place of the rows */
  error?: string | null;
}

const columns: Column<AssessmentQuestionResult>[] = [
  {
    header: "Question",
    render: questionLabel,
  },
  {
    header: "Result",
    render: (q) =>
      !q.answered || q.is_correct === null ? (
        "Not answered"
      ) : (
        <AssessmentResultBadge result={q.is_correct ? "pass" : "fail"} />
      ),
  },
  {
    header: "Position shown in exam",
    render: (q) => q.display_order,
  },
];

export function QuestionResultsTable({
  questions,
  loading = false,
  error = null,
}: QuestionResultsTableProps) {
  return (
    <DataTable
      data={questions}
      columns={columns}
      loading={loading}
      error={error}
      getRowKey={(q) => q.question_ref}
      emptyMessage="No questions in this assessment"
    />
  );
}
