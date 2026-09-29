/**
 * AppraisalPeriodTable Component
 *
 * The holder's CPD date ranges, newest first, each with its length so a
 * short range after a change of post reads as deliberate rather than as
 * a typing mistake.
 *
 * **The actions column appears only when there are actions.** Without
 * `onEdit` and `onRemove`, as for a holder whose passport is read-only,
 * the table lists the ranges and offers nothing to press.
 *
 * @example
 * ```tsx
 * <AppraisalPeriodTable periods={periods} onEdit={edit} onRemove={remove} />
 * ```
 */

import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import DataTable, { type Column } from "@components/tables/DataTable";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";
import FormattedDate from "@/components/data/Date";
import { Heading } from "@/components/typography";
import { IconPencil, IconTrash } from "@/components/icons/appIcons";
import {
  describeLength,
  newestFirst,
  type AppraisalPeriod,
} from "@lib/passport";

/** "1 October 2025", for a screen reader naming the row's menu. */
function spokenDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface AppraisalPeriodTableProps {
  /** The ranges, in any order */
  periods: AppraisalPeriod[];
  /** Called when the holder chooses to correct a range */
  onEdit?: (period: AppraisalPeriod) => void;
  /** Called when the holder chooses to remove a range */
  onRemove?: (period: AppraisalPeriod) => void;
  /** Show the table's loading state */
  isLoading?: boolean;
}

export default function AppraisalPeriodTable({
  periods,
  onEdit,
  onRemove,
  isLoading = false,
}: AppraisalPeriodTableProps) {
  const columns: Column<AppraisalPeriod>[] = [
    {
      header: "From",
      render: (period) => (
        <FormattedDate date={period.starts_on} format="medium" />
      ),
      accessor: (period) => period.starts_on,
    },
    {
      header: "To",
      render: (period) => (
        <FormattedDate date={period.ends_on} format="medium" />
      ),
      accessor: (period) => period.ends_on,
    },
    {
      header: "Length",
      render: (period) => describeLength(period),
    },
  ];

  if (onEdit && onRemove) {
    columns.push({
      header: "",
      render: (period) => (
        <EllipsisMenu
          aria-label={`Actions for the date range from ${spokenDate(period.starts_on)}`}
          items={[
            {
              label: "Edit",
              icon: <IconPencil />,
              onClick: () => onEdit(period),
            },
            {
              label: "Remove",
              icon: <IconTrash />,
              color: "var(--alert-color)",
              onClick: () => onRemove(period),
            },
          ]}
        />
      ),
    });
  }

  return (
    <BaseCard data-testid="appraisal-period-table">
      <Stack gap="md">
        <Heading>Date ranges</Heading>
        <DataTable
          data={newestFirst(periods)}
          columns={columns}
          getRowKey={(period) => `${period.starts_on}-${period.ends_on}`}
          loading={isLoading}
          emptyMessage="No date ranges added"
        />
      </Stack>
    </BaseCard>
  );
}
