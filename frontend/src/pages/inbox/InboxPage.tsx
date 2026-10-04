/**
 * Inbox Page
 *
 * Everything waiting on the person signed in, from every feature that
 * has something, and beneath it what was lately dealt with, so that
 * something done can be found again. Reached from the envelope in the
 * top ribbon.
 *
 * A line says who and what kind, never what anybody wrote: pressing it
 * opens the feature's own page, where the words are and where it is
 * dealt with. Nothing is dealt with here, and opening a line does not
 * clear it. It leaves the top list when the work is done.
 *
 * Feedback is the only source so far. Sign-off requests and messages
 * between clinicians are to follow, each as lines of the same kind. See
 * docs/docs/plans/2026-10-04-waiting-on-me-inbox-plan.md.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import FormattedDate from "@/components/data/Date";
import PageHeader from "@/components/page-header";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import { Heading } from "@/components/typography";
import {
  getInboxItems,
  inboxItemHref,
  type InboxItem,
} from "@/lib/inbox/inbox";

/** One line's key: an id is only unique within its own source. */
function rowKey(item: InboxItem): string {
  return `${item.source}:${item.id}`;
}

const waitingColumns: Column<InboxItem>[] = [
  {
    header: "What",
    render: (item) => item.title,
    accessor: (item) => item.title,
  },
  {
    header: "About",
    render: (item) => item.detail ?? "–",
    accessor: (item) => item.detail ?? "",
  },
  {
    header: "Received",
    render: (item) => <FormattedDate date={item.created_at} />,
    accessor: (item) => item.created_at,
  },
];

const doneColumns: Column<InboxItem>[] = [
  ...waitingColumns.slice(0, 2),
  {
    header: "Outcome",
    render: (item) => item.status ?? "–",
    accessor: (item) => item.status ?? "",
  },
  waitingColumns[2],
];

export default function InboxPage() {
  const navigate = useNavigate();
  const [waiting, setWaiting] = useState<InboxItem[]>([]);
  const [done, setDone] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchItems() {
      try {
        const [open, closed] = await Promise.all([
          getInboxItems(false),
          getInboxItems(true),
        ]);
        if (!cancelled) {
          setWaiting(open);
          setDone(closed);
        }
      } catch {
        if (!cancelled) setError("Your inbox could not be loaded");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchItems();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchFields = useCallback(
    (item: InboxItem) => [item.title, item.detail, item.status],
    [],
  );

  return (
    <Stack gap="lg">
      <PageHeader title="Inbox" />

      <BaseCard>
        <Stack gap="md">
          <Heading>Waiting on you</Heading>
          <DataTableControlled
            data={waiting}
            columns={waitingColumns}
            onRowClick={(item) => navigate(inboxItemHref(item))}
            getRowKey={rowKey}
            loading={loading}
            error={error}
            emptyMessage="Nothing is waiting on you"
            searchFields={searchFields}
          />
        </Stack>
      </BaseCard>

      <BaseCard>
        <Stack gap="md">
          <Heading>Completed</Heading>
          <DataTableControlled
            data={done}
            columns={doneColumns}
            onRowClick={(item) => navigate(inboxItemHref(item))}
            getRowKey={rowKey}
            loading={loading}
            error={error}
            emptyMessage="Nothing completed yet"
            searchFields={searchFields}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}
