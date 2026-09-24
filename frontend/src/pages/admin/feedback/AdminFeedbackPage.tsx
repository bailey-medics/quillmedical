/**
 * Admin Feedback Page
 *
 * Every piece of feedback users have sent, newest first, so an operator
 * can see what is still outstanding and open one to read and close it.
 * Without this the `feedback` table is write-only, and the feature is no
 * better than the error log it was meant to improve on.
 *
 * Operator-only: feedback comes from every organisation and may contain
 * patient data. The route guard hides the page; the API refuses the data.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import FeedbackStatusBadge from "@/components/badge/FeedbackStatusBadge";
import FormattedDate from "@/components/data/Date";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  categoryLabel,
  listFeedback,
  type FeedbackItem,
} from "@/lib/feedback/feedbackAdmin";

/** How much of a message the list shows before the detail page. */
const PREVIEW_LENGTH = 80;

function preview(message: string): string {
  return message.length > PREVIEW_LENGTH
    ? `${message.slice(0, PREVIEW_LENGTH)}…`
    : message;
}

export default function AdminFeedbackPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFeedback() {
      try {
        setItems(await listFeedback());
      } catch {
        setError("Feedback could not be loaded");
      } finally {
        setLoading(false);
      }
    }

    void fetchFeedback();
  }, []);

  const searchFields = useCallback(
    (item: FeedbackItem) => [
      item.message,
      item.sender ?? "",
      item.route,
      categoryLabel(item.category),
    ],
    [],
  );

  const filterOptions = useMemo(
    () => [
      {
        group: "Status",
        items: FEEDBACK_STATUSES.map((status) => ({
          value: `status:${status}`,
          label: FEEDBACK_STATUS_LABELS[status],
        })),
      },
    ],
    [],
  );

  const filterPredicate = useCallback((filters: string[]) => {
    const statuses = filters
      .filter((filter) => filter.startsWith("status:"))
      .map((filter) => filter.slice("status:".length));

    return (item: FeedbackItem) =>
      statuses.length === 0 || statuses.includes(item.status);
  }, []);

  const columns: Column<FeedbackItem>[] = [
    {
      header: "Status",
      render: (item) => <FeedbackStatusBadge status={item.status} />,
      accessor: (item) => FEEDBACK_STATUSES.indexOf(item.status),
    },
    {
      header: "Received",
      render: (item) => <FormattedDate date={item.created_at} />,
      accessor: (item) => item.created_at,
    },
    {
      header: "From",
      render: (item) => item.sender ?? "Deleted user",
      accessor: (item) => item.sender ?? "",
    },
    {
      header: "About",
      render: (item) => categoryLabel(item.category),
      accessor: (item) => categoryLabel(item.category),
    },
    {
      header: "Message",
      render: (item) => preview(item.message),
      accessor: (item) => item.message,
    },
    {
      header: "Page",
      render: (item) => item.route || "Not known",
      accessor: (item) => item.route,
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title="Feedback" />

      <DataTableControlled
        data={items}
        columns={columns}
        onRowClick={(item) => navigate(`/admin/feedback/${item.id}`)}
        getRowKey={(item) => item.id}
        loading={loading}
        error={error}
        emptyMessage="No feedback yet"
        searchFields={searchFields}
        filterData={filterOptions}
        filterLabel="Filter feedback"
        filterAriaLabel="Filter feedback"
        filterPredicate={filterPredicate}
      />
    </Stack>
  );
}
