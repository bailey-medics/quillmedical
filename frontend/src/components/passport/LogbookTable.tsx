/**
 * LogbookTable Component
 *
 * A competency's logbook entries, and how many there are.
 *
 * **A count and no target, deliberately.** Two hundred bronchoscopies
 * prove activity, not competence; the sign-off is what turns evidence
 * into a conclusion. So this renders "38 entries" and never "38 of 50",
 * never a percentage, and never a progress bar. How many is enough is a
 * judgement belonging to the assessor, and a table that appeared to have
 * decided first would invite them to defer to it.
 *
 * **Entries sort by when the procedure happened**, not by when they were
 * logged. The server names each file for the moment it was written, so
 * the raw directory listing is in logging order — but a holder reading
 * their own logbook thinks in clinical dates, and five logged on a
 * Friday evening should not read as five procedures on a Friday.
 *
 * @example
 * ```tsx
 * <LogbookTable logbook={logbook} />
 * ```
 */

import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import DataTable, { type Column } from "@components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import { BodyText, Heading } from "@/components/typography";
import type { Logbook, LogbookEntry } from "@lib/passport";

/**
 * Supervision is shown as it was recorded and never ranked: an entry
 * logged as supervised is a different fact, not a lesser one.
 */
function supervisionLabel(entry: LogbookEntry): string {
  if (entry.supervision === "supervised") return "Supervised";
  if (entry.supervision === "independent") return "Independent";
  return "—";
}

const columns: Column<LogbookEntry>[] = [
  {
    header: "Performed on",
    render: (entry) => (
      <FormattedDate date={entry.performed_on} format="medium" />
    ),
    accessor: (entry) => entry.performed_on,
  },
  {
    header: "Setting",
    render: (entry) => entry.setting ?? "—",
    accessor: (entry) => entry.setting,
  },
  {
    header: "Supervision",
    render: supervisionLabel,
    accessor: (entry) => entry.supervision,
  },
  {
    header: "Indication",
    render: (entry) => entry.indication ?? "—",
  },
  {
    header: "Outcome",
    render: (entry) => entry.outcome ?? "—",
  },
];

export interface LogbookTableProps {
  /** The competency's logbook, carrying its entries and their count */
  logbook: Logbook;
  /** Human name for the competency, where the page knows it */
  competencyName?: string;
  /** Called when an entry is chosen */
  onSelect?: (entry: LogbookEntry) => void;
  /** Show the table's loading state */
  isLoading?: boolean;
}

export default function LogbookTable({
  logbook,
  competencyName,
  onSelect,
  isLoading = false,
}: LogbookTableProps) {
  // The server already reports the count. Using it rather than
  // entries.length keeps the number right if a page ever shows a subset.
  const { count, entries } = logbook;

  const sorted = [...entries].sort((a, b) =>
    a.performed_on.localeCompare(b.performed_on),
  );

  return (
    <BaseCard data-testid="logbook-table">
      <Stack gap="md">
        <Heading>{competencyName ?? logbook.competency}</Heading>

        {/* A plain count. No denominator, no percentage, no bar. */}
        <BodyText c="dimmed">
          {count} {count === 1 ? "entry" : "entries"}
        </BodyText>

        <DataTable
          data={sorted}
          columns={columns}
          getRowKey={(entry) => entry.filename}
          onRowClick={onSelect ? (entry) => onSelect(entry) : undefined}
          loading={isLoading}
          emptyMessage="No entries yet"
        />
      </Stack>
    </BaseCard>
  );
}
