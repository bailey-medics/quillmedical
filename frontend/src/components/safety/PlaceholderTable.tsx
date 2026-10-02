/**
 * PlaceholderTable Component
 *
 * The placeholders of a safety case: values substituted into every
 * document that names them, so a product name or version is written once
 * and the documents stay in step. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import type { ReactNode } from "react";
import { type Column } from "@components/tables/DataTable";
import DataTableControlled from "@components/tables/DataTableControlled";
import type { Placeholder } from "@lib/safety";

const columns: Column<Placeholder>[] = [
  {
    header: "Placeholder",
    render: (placeholder) => placeholder.key,
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
  /**
   * The table's own action, such as an add icon, shown in the row with
   * search and filter. See `DataTableControlled`.
   */
  action?: ReactNode;
}

export default function PlaceholderTable({
  placeholders,
  action,
}: PlaceholderTableProps) {
  return (
    <DataTableControlled
      action={action}
      searchFields={(placeholder) => [placeholder.key, placeholder.value]}
      data={placeholders}
      columns={columns}
      getRowKey={(placeholder) => placeholder.key}
      emptyMessage="No placeholders defined"
    />
  );
}
