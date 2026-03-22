/**
 * AssessmentHistoryTable Component
 *
 * Table of past assessment attempts with date, question bank, scores,
 * and pass/fail badge.
 */

import { Badge, Table, Text } from "@mantine/core";
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

export function AssessmentHistoryTable({
  assessments,
  onSelect,
}: AssessmentHistoryTableProps) {
  if (assessments.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No assessments yet.
      </Text>
    );
  }

  return (
    <Table highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Date</Table.Th>
          <Table.Th>Question bank</Table.Th>
          <Table.Th>Items</Table.Th>
          <Table.Th>Result</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {assessments.map((a) => (
          <Table.Tr
            key={a.id}
            onClick={() => onSelect?.(a.id)}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            <Table.Td>
              {a.completed_at ? formatDate(a.completed_at) : "In progress"}
            </Table.Td>
            <Table.Td>{a.question_bank_id}</Table.Td>
            <Table.Td>{a.total_items}</Table.Td>
            <Table.Td>
              {a.is_passed === null ? (
                <Badge variant="light" color="gray" size="sm">
                  Incomplete
                </Badge>
              ) : a.is_passed ? (
                <Badge variant="light" color="green" size="sm">
                  Pass
                </Badge>
              ) : (
                <Badge variant="light" color="red" size="sm">
                  Fail
                </Badge>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
