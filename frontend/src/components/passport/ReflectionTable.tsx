/**
 * ReflectionTable Component
 *
 * The holder's reflections as a table, newest first, laid out as the
 * logbook and CPD tables are so the passport's sections read alike.
 *
 * Titles and dates only. The writing itself opens on the reflection's
 * own page, so a list glanced at over somebody's shoulder shows no more
 * than what each one is called.
 *
 * @example
 * ```tsx
 * <ReflectionTable reflections={reflections} onSelect={open} />
 * ```
 */

import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import DataTable, { type Column } from "@components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import { Heading } from "@/components/typography";
import type { Reflection } from "@lib/passport";

const columns: Column<Reflection>[] = [
  {
    header: "Written on",
    render: (reflection) => (
      <FormattedDate date={reflection.written_on} format="medium" />
    ),
    accessor: (reflection) => reflection.written_on,
  },
  {
    header: "Title",
    render: (reflection) => reflection.title,
    accessor: (reflection) => reflection.title,
  },
];

export interface ReflectionTableProps {
  /** The reflections, in any order */
  reflections: Reflection[];
  /** Called when a reflection is chosen */
  onSelect?: (reflection: Reflection) => void;
  /** Show the table's loading state */
  isLoading?: boolean;
}

export default function ReflectionTable({
  reflections,
  onSelect,
  isLoading = false,
}: ReflectionTableProps) {
  const sorted = [...reflections].sort((a, b) =>
    b.written_on.localeCompare(a.written_on),
  );

  return (
    <BaseCard data-testid="reflection-table">
      <Stack gap="md">
        <Heading>Reflections</Heading>
        <DataTable
          data={sorted}
          columns={columns}
          getRowKey={(reflection) => reflection.name}
          onRowClick={onSelect}
          loading={isLoading}
          emptyMessage="No reflections written"
        />
      </Stack>
    </BaseCard>
  );
}
