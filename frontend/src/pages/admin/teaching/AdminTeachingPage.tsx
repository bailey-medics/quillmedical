/**
 * Admin Teaching Page
 *
 * Displays all teaching modules (question banks) with their sync status.
 * Provides a "Sync all" button to trigger a full sync from GCS/filesystem.
 */

import { useCallback, useEffect, useState } from "react";
import { Container, Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import DataTable, { type Column } from "@/components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import IconTextButton from "@/components/button/IconTextButton";
import { BodyText } from "@/components/typography";
import { api } from "@/lib/api";
import type { AdminBank, SyncAllResult } from "@/features/teaching/types";

export default function AdminTeachingPage() {
  const [banks, setBanks] = useState<AdminBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchBanks = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get<AdminBank[]>("/teaching/admin/banks");
      setBanks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load modules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const result = await api.post<SyncAllResult>(
        "/teaching/admin/sync-all",
        {},
      );
      const syncedCount = result.synced.length;
      const errorCount = result.errors.length;

      if (errorCount > 0) {
        setSyncMessage(
          `Synced ${syncedCount} bank(s) with ${errorCount} error(s)`,
        );
      } else {
        setSyncMessage(`Successfully synced ${syncedCount} bank(s)`);
      }

      // Refresh the list
      await fetchBanks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const columns: Column<AdminBank>[] = [
    {
      header: "Module",
      width: "40%",
      render: (bank) => bank.title ?? bank.bank_id,
    },
    {
      header: "Type",
      width: "15%",
      render: (bank) => bank.type ?? "—",
    },
    {
      header: "Version",
      width: "10%",
      render: (bank) => bank.version ?? "—",
    },
    {
      header: "Items",
      width: "10%",
      render: (bank) => bank.item_count,
    },
    {
      header: "Last synced",
      width: "15%",
      render: (bank) =>
        bank.synced_at ? (
          <FormattedDate date={bank.synced_at} locale="en-GB" />
        ) : (
          "Never"
        ),
    },
  ];

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <PageHeader title="Teaching modules" />
          <IconTextButton
            icon="refresh"
            label="Sync all"
            onClick={handleSyncAll}
            disabled={syncing}
          />
        </Group>

        {syncMessage && <BodyText>{syncMessage}</BodyText>}

        <DataTable
          data={banks}
          columns={columns}
          getRowKey={(bank) => bank.bank_id}
          onRowClick={() => {}}
          loading={loading}
          error={error}
          emptyMessage="No teaching modules found"
        />
      </Stack>
    </Container>
  );
}
