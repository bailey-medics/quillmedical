/**
 * DocumentTable Component
 *
 * The documents in a safety case file, as DCB0129 names them: the
 * clinical risk management plan, the hazard log, the clinical safety case
 * report and the file index. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { Badge } from "@mantine/core";
import DataTable, { type Column } from "@components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import { badgeColours, BADGE_VARIANT } from "@/components/badge/badgeColours";
import type { SafetyDocument } from "@lib/safety";

const columns: Column<SafetyDocument>[] = [
  {
    header: "Document",
    render: (document) => document.name,
    accessor: (document) => document.name,
  },
  {
    header: "Version",
    render: (document) => document.version,
    accessor: (document) => document.version,
  },
  {
    header: "Status",
    render: (document) =>
      document.status === "approved" ? (
        <Badge
          color={badgeColours.success.bg}
          c={badgeColours.success.text}
          variant={BADGE_VARIANT}
        >
          Approved
        </Badge>
      ) : (
        <Badge
          color={badgeColours.neutral.bg}
          c={badgeColours.neutral.text}
          variant={BADGE_VARIANT}
        >
          Draft
        </Badge>
      ),
    accessor: (document) => document.status,
  },
  {
    header: "Last updated",
    render: (document) => (
      <FormattedDate date={document.updated_on} format="medium" />
    ),
    accessor: (document) => document.updated_on,
  },
];

export interface DocumentTableProps {
  documents: SafetyDocument[];
  /** Called when a document is chosen */
  onSelect?: (document: SafetyDocument) => void;
}

export default function DocumentTable({
  documents,
  onSelect,
}: DocumentTableProps) {
  return (
    <DataTable
      data={documents}
      columns={columns}
      getRowKey={(document) => document.id}
      onRowClick={onSelect}
      emptyMessage="No documents in this case file"
    />
  );
}
