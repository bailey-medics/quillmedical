/**
 * IncidentTable Component
 *
 * Safety incidents on a case, each linked to the hazard it realised.
 * The summaries describe a system fault, never a patient. Part of the
 * safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { Badge } from "@mantine/core";
import DataTable, { type Column } from "@components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "@/components/badge/badgeColours";
import type { Incident, IncidentSeverity } from "@lib/safety";

const SEVERITY: Record<
  IncidentSeverity,
  { label: string; colour: BadgeColourConfig }
> = {
  low: { label: "Low", colour: badgeColours.neutral },
  moderate: { label: "Moderate", colour: badgeColours.warning },
  high: { label: "High", colour: badgeColours.alert },
};

const columns: Column<Incident>[] = [
  {
    header: "Ref",
    render: (incident) => incident.id,
    accessor: (incident) => incident.id,
  },
  {
    header: "Occurred on",
    render: (incident) => (
      <FormattedDate date={incident.occurred_on} format="medium" />
    ),
    accessor: (incident) => incident.occurred_on,
  },
  {
    header: "What happened",
    render: (incident) => incident.summary,
  },
  {
    header: "Severity",
    render: (incident) => {
      const { label, colour } = SEVERITY[incident.severity];
      return (
        <Badge color={colour.bg} c={colour.text} variant={BADGE_VARIANT}>
          {label}
        </Badge>
      );
    },
    accessor: (incident) => incident.severity,
  },
  {
    header: "Hazard",
    render: (incident) => incident.hazard_id,
    accessor: (incident) => incident.hazard_id,
  },
];

export interface IncidentTableProps {
  incidents: Incident[];
  /** Called when an incident is chosen */
  onSelect?: (incident: Incident) => void;
}

export default function IncidentTable({
  incidents,
  onSelect,
}: IncidentTableProps) {
  const sorted = [...incidents].sort((a, b) =>
    b.occurred_on.localeCompare(a.occurred_on),
  );
  return (
    <DataTable
      data={sorted}
      columns={columns}
      getRowKey={(incident) => incident.id}
      onRowClick={onSelect}
      emptyMessage="No incidents recorded against this case"
    />
  );
}
