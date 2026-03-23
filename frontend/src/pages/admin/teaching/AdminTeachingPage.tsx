/**
 * Admin Teaching Page
 *
 * Displays all teaching modules (question banks) with their sync status.
 * Provides a "Sync all" button to trigger a full sync from GCS/filesystem.
 */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Container, Group, Stack, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import AdminTable, { type Column } from "@/components/tables/AdminTable";
import FormattedDate from "@/components/data/Date";
import Icon from "@/components/icons";
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
      render: (bank) => (
        <div>
          <Text fw={500}>{bank.title ?? bank.bank_id}</Text>
          {bank.title && (
            <Text size="xs" c="dimmed">
              {bank.bank_id}
            </Text>
          )}
        </div>
      ),
    },
    {
      header: "Type",
      render: (bank) => bank.type ?? "—",
    },
    {
      header: "Version",
      render: (bank) => bank.version ?? "—",
    },
    {
      header: "Items",
      render: (bank) => bank.item_count,
    },
    {
      header: "Source",
      render: (bank) => (
        <Group gap="xs">
          {bank.in_gcs && (
            <Badge size="sm" variant="light" color="blue">
              GCS
            </Badge>
          )}
          {bank.in_db && (
            <Badge size="sm" variant="light" color="green">
              DB
            </Badge>
          )}
        </Group>
      ),
    },
    {
      header: "Last synced",
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
          <PageHeader
            title="Teaching modules"
            description="Question banks available for assessments"
            size="lg"
            mb={0}
          />
          <Button
            leftSection={<Icon icon={<IconRefresh />} size="sm" />}
            onClick={handleSyncAll}
            loading={syncing}
          >
            Sync all
          </Button>
        </Group>

        {syncMessage && (
          <Text size="sm" c="green">
            {syncMessage}
          </Text>
        )}

        <AdminTable
          data={banks}
          columns={columns}
          getRowKey={(bank) => bank.bank_id}
          onRowClick={() => {}}
          loading={loading}
          error={error}
          emptyMessage="No teaching modules found"
          breakpoint="md"
        />
      </Stack>
    </Container>
  );
}
