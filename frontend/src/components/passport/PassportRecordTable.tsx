/**
 * PassportRecordTable Component
 *
 * Every record in the passport in one table, newest first: sign-offs,
 * logbook entries, CPD activities, certificates and reflections. It shows
 * how busy the holder has been at a glance, and each row opens its record,
 * so they can pick out a few to show somebody, such as their appraiser.
 *
 * Paged, because a passport grows by hundreds of records over a career.
 * Only sign-offs carry a status; nobody countersigns the rest.
 *
 * @example
 * ```tsx
 * <PassportRecordTable records={records} onSelect={(r) => navigate(r.href)} />
 * ```
 */

import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import SignOffStatusBadge from "@/components/badge/SignOffStatusBadge";
import DataTable, { type Column } from "@components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import { Heading } from "@/components/typography";
import { RECORD_KIND_LABELS, type PassportRecord } from "@lib/passport";

/** Rows per page. */
export const RECORDS_PER_PAGE = 20;

const columns: Column<PassportRecord>[] = [
  {
    header: "Date",
    render: (record) => <FormattedDate date={record.on} format="medium" />,
    accessor: (record) => record.on,
  },
  {
    header: "Type",
    render: (record) => RECORD_KIND_LABELS[record.kind],
    accessor: (record) => RECORD_KIND_LABELS[record.kind],
  },
  {
    header: "Title",
    render: (record) => record.title,
    accessor: (record) => record.title,
  },
  {
    header: "Status",
    render: (record) =>
      record.status ? <SignOffStatusBadge status={record.status} /> : "–",
  },
];

export interface PassportRecordTableProps {
  /** The records, newest first */
  records: PassportRecord[];
  /** Called when a record is chosen */
  onSelect?: (record: PassportRecord) => void;
  /** Show the table's loading state */
  isLoading?: boolean;
}

export default function PassportRecordTable({
  records,
  onSelect,
  isLoading = false,
}: PassportRecordTableProps) {
  return (
    <BaseCard data-testid="passport-record-table">
      <Stack gap="md">
        <Heading>Records</Heading>
        <DataTable
          data={records}
          columns={columns}
          getRowKey={(record) => record.key}
          onRowClick={onSelect}
          loading={isLoading}
          pageSize={RECORDS_PER_PAGE}
          emptyMessage="Nothing recorded yet"
        />
      </Stack>
    </BaseCard>
  );
}
