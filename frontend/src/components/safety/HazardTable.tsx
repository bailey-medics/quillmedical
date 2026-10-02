/**
 * HazardTable Component
 *
 * A DCB0129 hazard log: each hazard with its cause and effect, its risk
 * rating before and after mitigation, and where it stands. The rating is
 * likelihood times severity on a 5 by 5 matrix, shown by
 * `RiskScoreBadge`. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { Badge } from "@mantine/core";
import DataTable, { type Column } from "@components/tables/DataTable";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "@/components/badge/badgeColours";
import RiskScoreBadge from "./RiskScoreBadge";
import { riskRating, type Hazard, type HazardStatus } from "@lib/safety";

const STATUS: Record<
  HazardStatus,
  { label: string; colour: BadgeColourConfig }
> = {
  open: { label: "Open", colour: badgeColours.alert },
  mitigated: { label: "Mitigated", colour: badgeColours.warning },
  closed: { label: "Closed", colour: badgeColours.success },
};

const columns: Column<Hazard>[] = [
  {
    header: "Ref",
    render: (hazard) => hazard.id,
    accessor: (hazard) => hazard.id,
    width: "5rem",
  },
  {
    header: "Hazard",
    render: (hazard) => hazard.description,
    accessor: (hazard) => hazard.description,
  },
  {
    header: "Cause",
    render: (hazard) => hazard.cause,
  },
  {
    header: "Effect",
    render: (hazard) => hazard.effect,
  },
  {
    header: "Initial risk",
    render: (hazard) => (
      <RiskScoreBadge
        likelihood={hazard.initial_likelihood}
        severity={hazard.initial_severity}
      />
    ),
    accessor: (hazard) =>
      riskRating(hazard.initial_likelihood, hazard.initial_severity),
  },
  {
    header: "Residual risk",
    render: (hazard) => (
      <RiskScoreBadge
        likelihood={hazard.residual_likelihood}
        severity={hazard.residual_severity}
      />
    ),
    accessor: (hazard) =>
      riskRating(hazard.residual_likelihood, hazard.residual_severity),
  },
  {
    header: "Status",
    render: (hazard) => {
      const { label, colour } = STATUS[hazard.status];
      return (
        <Badge color={colour.bg} c={colour.text} variant={BADGE_VARIANT}>
          {label}
        </Badge>
      );
    },
    accessor: (hazard) => hazard.status,
  },
];

export interface HazardTableProps {
  hazards: Hazard[];
  /** Called when a hazard is chosen */
  onSelect?: (hazard: Hazard) => void;
}

export default function HazardTable({ hazards, onSelect }: HazardTableProps) {
  return (
    <DataTable
      data={hazards}
      columns={columns}
      getRowKey={(hazard) => hazard.id}
      onRowClick={onSelect}
      emptyMessage="No hazards in the log"
    />
  );
}
