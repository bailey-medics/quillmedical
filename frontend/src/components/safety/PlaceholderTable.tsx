/**
 * PlaceholderTable Component
 *
 * The placeholders of a safety case: values substituted into every
 * document that names them, so a product name or version is written once
 * and the documents stay in step. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import DataTable, { type Column } from "@components/tables/DataTable";
import type { Placeholder } from "@lib/safety";

const columns: Column<Placeholder>[] = [
  {
    header: "Placeholder",
    render: (placeholder) => `{{ ${placeholder.key} }}`,
    accessor: (placeholder) => placeholder.key,
  },
  {
    header: "Value",
    render: (placeholder) => placeholder.value,
    accessor: (placeholder) => placeholder.value,
  },
  {
    header: "Used in",
    render: (placeholder) => placeholder.used_in.join(", "),
  },
];

export interface PlaceholderTableProps {
  placeholders: Placeholder[];
}

export default function PlaceholderTable({
  placeholders,
}: PlaceholderTableProps) {
  return (
    <DataTable
      data={placeholders}
      columns={columns}
      getRowKey={(placeholder) => placeholder.key}
      emptyMessage="No placeholders defined"
    />
  );
}
