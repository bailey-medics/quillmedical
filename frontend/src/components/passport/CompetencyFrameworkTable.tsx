/**
 * CompetencyFrameworkTable Component
 *
 * One framework a holder works to, as a table: every competency in it, where
 * its sign-off stands, and how many logbook entries it has. The By
 * competency view of the passport is one of these for each framework.
 *
 * **Every item in the framework is a row**, whether or not the holder has
 * anything against it yet. That is the difference from `CompetencySummary`,
 * which lists only what the passport holds evidence for: a registrar
 * working to a framework wants to see what is still to do, not only what is
 * done.
 *
 * **No "3 of 7 signed off" count under the name**, as agreed at review:
 * `CompetencySummary` was built without totals, and that decision stands.
 *
 * **The logbook count has its own column**, never sitting inside the
 * sign-off cell. Beside a status it would read as part of the sign-off,
 * which is why `CompetencyRow` leaves it off its sign-off lists.
 *
 * @example
 * ```tsx
 * <CompetencyFrameworkTable
 *   framework={{ id: "ghnft_radiotherapy_record", name: "…" }}
 *   competencies={detail.competencies}
 *   onSelect={(id) => navigate(`/passport/competencies/${id}`)}
 * />
 * ```
 */

import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import SignOffStatusBadge from "@/components/badge/SignOffStatusBadge";
import DataTable, { type Column } from "@components/tables/DataTable";
import { BodyText, Heading } from "@/components/typography";
import {
  frameworkRows,
  logbookLabel,
  type CompetencyTableRow,
} from "@lib/passport/competencyTable";
import type { CompetencyState, FrameworkRef } from "@lib/passport";

const columns: Column<CompetencyTableRow>[] = [
  {
    header: "Competency",
    render: (row) => (row.scope ? `${row.name} (${row.scope.name})` : row.name),
  },
  {
    header: "Sign-off",
    render: (row) =>
      row.standing === "not_asked" ? (
        <BodyText c="dimmed">Not asked</BodyText>
      ) : (
        <SignOffStatusBadge status={row.standing} />
      ),
    width: "10rem",
  },
  {
    header: "Logbook",
    render: (row) => logbookLabel(row.logbookEntries),
    width: "8rem",
  },
];

export interface CompetencyFrameworkTableProps {
  /** The framework this table shows */
  framework: FrameworkRef;
  /** Every competency the passport holds evidence for, in any framework */
  competencies: CompetencyState[];
  /** Called with a competency's id when its row is chosen */
  onSelect?: (competencyId: string) => void;
}

/**
 * CompetencyFrameworkTable
 *
 * Renders the framework's name and its table in a card.
 */
export default function CompetencyFrameworkTable({
  framework,
  competencies,
  onSelect,
}: CompetencyFrameworkTableProps) {
  const rows = frameworkRows(framework.id, competencies);

  return (
    <BaseCard data-testid="competency-framework-table">
      <Stack gap="md">
        <Heading>{framework.name}</Heading>
        <DataTable
          data={rows}
          columns={columns}
          getRowKey={(row) => row.key}
          onRowClick={onSelect ? (row) => onSelect(row.id) : undefined}
          emptyMessage="This framework has no competencies to show"
        />
      </Stack>
    </BaseCard>
  );
}
