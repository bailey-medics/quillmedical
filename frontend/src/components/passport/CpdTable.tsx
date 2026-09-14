/**
 * CpdTable Component
 *
 * One appraisal period's CPD activities, and the points they add up to.
 *
 * **Every total states the range it covers.** Not "2026 — 32 points" but
 * the actual dates, because appraisal years do not start in January and
 * they move when somebody changes post. Thirty-two points across four
 * months and thirty-two across twelve are different records, and only
 * the declared range tells a reader which they are looking at. A bare
 * year label would make an honest short period look like a poor year.
 *
 * **June to June is the fallback**, used when no period has been
 * declared. The heading says so rather than presenting a convention as
 * though it were the holder's actual cycle.
 *
 * **This is where a total is legitimate**, unlike the logbook. A logbook
 * count with a target implies the software has judged competence; a CPD
 * total is arithmetic over what the holder claimed, and an appraiser
 * asks for exactly that number. It still carries no target: whether the
 * points are enough is between the holder and their appraiser.
 *
 * @example
 * ```tsx
 * <CpdTable entries={entries} period={period} />
 * ```
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import DataTable, { type Column } from "@components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import type { CpdEntry } from "@lib/passport";

/**
 * The range a total covers. Supplied by the page from the holder's
 * declared `appraisal_periods`, or omitted to fall back to June-to-June.
 */
export interface AppraisalPeriod {
  from: string;
  to: string;
}

const columns: Column<CpdEntry>[] = [
  {
    header: "Date",
    render: (entry) => (
      <FormattedDate date={entry.activity_on} format="medium" />
    ),
    accessor: (entry) => entry.activity_on,
  },
  {
    header: "Activity",
    render: (entry) => entry.title,
    accessor: (entry) => entry.title,
  },
  {
    header: "Type",
    render: (entry) => entry.activity_type,
    accessor: (entry) => entry.activity_type,
  },
  {
    header: "Points",
    render: (entry) => (entry.points === null ? "—" : entry.points),
    accessor: (entry) => entry.points,
  },
];

export interface CpdTableProps {
  /** The period's activities */
  entries: CpdEntry[];
  /** The declared appraisal period these fall in */
  period?: AppraisalPeriod;
  /** Called when an activity is chosen */
  onSelect?: (entry: CpdEntry) => void;
  /** Show the table's loading state */
  isLoading?: boolean;
}

export default function CpdTable({
  entries,
  period,
  onSelect,
  isLoading = false,
}: CpdTableProps) {
  // Entries without points still count as activities; only the points
  // sum skips them.
  const total = entries.reduce((sum, entry) => sum + (entry.points ?? 0), 0);

  const sorted = [...entries].sort((a, b) =>
    a.activity_on.localeCompare(b.activity_on),
  );

  return (
    <BaseCard data-testid="cpd-table">
      <Stack gap="md">
        <Heading>Continuing professional development</Heading>

        {period ? (
          <BodyText c="dimmed">
            <FormattedDate date={period.from} format="medium" /> to{" "}
            <FormattedDate date={period.to} format="medium" />
          </BodyText>
        ) : (
          <BodyText c="dimmed">
            June to June — you have not set an appraisal period, so this is a
            convention rather than your actual cycle.
          </BodyText>
        )}

        {/* Arithmetic over what the holder claimed. No target: whether
            it is enough is between them and their appraiser. */}
        <Group gap="xs">
          <BodyTextBold>
            {total} {total === 1 ? "point" : "points"}
          </BodyTextBold>
          <BodyText c="dimmed">
            across {entries.length}{" "}
            {entries.length === 1 ? "activity" : "activities"}
          </BodyText>
        </Group>

        <DataTable
          data={sorted}
          columns={columns}
          getRowKey={(entry) => entry.filename}
          onRowClick={onSelect ? (entry) => onSelect(entry) : undefined}
          loading={isLoading}
          emptyMessage="Nothing recorded for this period"
        />
      </Stack>
    </BaseCard>
  );
}
