/**
 * SafetyCaseTable Component
 *
 * Every safety case, one row each, for the safety landing page. Part of
 * the safety mock-up, which reads fixtures and has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * @example
 * ```tsx
 * <SafetyCaseTable cases={SAFETY_CASES} onSelect={open} />
 * ```
 */

import DataTable, { type Column } from "@components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import SafetyStatusBadge from "./SafetyStatusBadge";
import { openHazardCount, type SafetyCaseDetail } from "@lib/safety";

const columns: Column<SafetyCaseDetail>[] = [
  {
    header: "Safety case",
    render: (safetyCase) => safetyCase.title,
    accessor: (safetyCase) => safetyCase.title,
  },
  {
    header: "System",
    render: (safetyCase) => safetyCase.system,
    accessor: (safetyCase) => safetyCase.system,
  },
  {
    header: "Standard",
    render: (safetyCase) => safetyCase.standard,
    accessor: (safetyCase) => safetyCase.standard,
  },
  {
    header: "Clinical safety officer",
    render: (safetyCase) => safetyCase.clinical_safety_officer,
    accessor: (safetyCase) => safetyCase.clinical_safety_officer,
  },
  {
    header: "Open hazards",
    render: (safetyCase) => openHazardCount(safetyCase),
    accessor: (safetyCase) => openHazardCount(safetyCase),
  },
  {
    header: "Status",
    render: (safetyCase) => <SafetyStatusBadge status={safetyCase.status} />,
    accessor: (safetyCase) => safetyCase.status,
  },
  {
    header: "Last updated",
    render: (safetyCase) => (
      <FormattedDate date={safetyCase.updated_on} format="medium" />
    ),
    accessor: (safetyCase) => safetyCase.updated_on,
  },
];

export interface SafetyCaseTableProps {
  /** The cases, in the order to show them */
  cases: readonly SafetyCaseDetail[];
  /** Called when a case is chosen */
  onSelect?: (safetyCase: SafetyCaseDetail) => void;
}

export default function SafetyCaseTable({
  cases,
  onSelect,
}: SafetyCaseTableProps) {
  return (
    <DataTable
      data={[...cases]}
      columns={columns}
      getRowKey={(safetyCase) => safetyCase.id}
      onRowClick={onSelect}
      emptyMessage="No safety cases"
    />
  );
}
