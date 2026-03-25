/**
 * AssessmentHistoryTable Component
 *
 * Table of past assessment attempts with date, question bank, scores,
 * and pass/fail badge. Uses AdminTable for consistent responsive layout.
 */

import AssessmentResultBadge from "@components/badge/AssessmentResultBadge";
import AdminTable, { type Column } from "@components/tables/AdminTable";
import type { AssessmentHistory } from "@/features/teaching/types";

interface AssessmentHistoryTableProps {
  /** List of assessment history records */
  assessments: AssessmentHistory[];
  /** Called when a row is clicked */
  onSelect?: (id: number) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const columns: Column<AssessmentHistory>[] = [
  {
    header: "Date",
    render: (a) =>
      a.completed_at ? formatDate(a.completed_at) : "In progress",
  },
  {
    header: "Question bank",
    render: (a) => a.question_bank_id,
  },
  {
    header: "Result",
    render: (a) => (
      <AssessmentResultBadge
        result={
          a.is_passed === null ? "incomplete" : a.is_passed ? "pass" : "fail"
        }
      />
    ),
  },
];

export function AssessmentHistoryTable({
  assessments,
  onSelect,
}: AssessmentHistoryTableProps) {
  return (
    <AdminTable
      data={assessments}
      columns={columns}
      onRowClick={(a) => onSelect?.(a.id)}
      getRowKey={(a) => a.id}
      emptyMessage="No assessments yet."
    />
  );
}
