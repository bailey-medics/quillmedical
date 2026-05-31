/**
 * Admin Teaching Page
 *
 * Displays all teaching modules (question banks) with their sync status.
 * Provides a "Sync all" button to trigger a full sync from GCS/filesystem.
 * Uses SyncResultsPanel to show before/after sync state.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container } from "@mantine/core";
import { SyncResultsPanel, getSyncSummary } from "@/components/teaching";
import type { SyncModuleRow } from "@/components/teaching/sync-results-panel";
import { usePageMessage } from "@/components/page-message";
import { api } from "@/lib/api";
import type { AdminBank, SyncAllResult } from "@/features/teaching/types";

function banksToModules(banks: AdminBank[]): SyncModuleRow[] {
  return banks.map((bank) => ({
    bank_id: bank.bank_id,
    title: bank.title ?? bank.bank_id,
    type: bank.type ?? "—",
    outcome: "imported" as const,
    version: bank.version ?? 0,
    item_count: bank.item_count,
    reason: "",
    last_synced: bank.synced_at ?? undefined,
  }));
}

function syncResultToModules(
  banks: AdminBank[],
  result: SyncAllResult,
): SyncModuleRow[] {
  const rows: SyncModuleRow[] = banks.map((bank) => {
    const synced = result.synced.find(
      (s) => s.question_bank_id === bank.bank_id,
    );
    const err = result.errors.find((e) => e.bank_id === bank.bank_id);

    if (err) {
      return {
        bank_id: bank.bank_id,
        title: bank.title ?? bank.bank_id,
        type: bank.type ?? "—",
        outcome: "error" as const,
        version: bank.version ?? 0,
        item_count: bank.item_count,
        reason: String(err.error),
      };
    }

    if (synced) {
      return {
        bank_id: bank.bank_id,
        title: bank.title ?? bank.bank_id,
        type: bank.type ?? "—",
        outcome: "imported" as const,
        version: synced.version,
        item_count: synced.items_created + synced.items_updated,
        reason: "",
      };
    }

    // Module wasn't in the sync result — already up to date
    return {
      bank_id: bank.bank_id,
      title: bank.title ?? bank.bank_id,
      type: bank.type ?? "—",
      outcome: "up_to_date" as const,
      version: bank.version ?? 0,
      item_count: bank.item_count,
      reason: "",
    };
  });

  // Include errors for banks not already in the DB
  const knownBankIds = new Set(banks.map((b) => b.bank_id));
  for (const err of result.errors) {
    if (!knownBankIds.has(err.bank_id)) {
      rows.push({
        bank_id: err.bank_id,
        title: err.bank_id,
        type: "—",
        outcome: "error" as const,
        version: 0,
        item_count: 0,
        reason: String(err.error),
      });
    }
  }

  return rows;
}

export default function AdminTeachingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [modules, setModules] = useState<SyncModuleRow[]>([]);
  const { showMessage } = usePageMessage();

  const fetchBanks = useCallback(async () => {
    const data = await api.get<AdminBank[]>("/teaching/admin/banks");
    return data;
  }, []);

  useEffect(() => {
    fetchBanks()
      .then((data) => {
        setModules(banksToModules(data));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [fetchBanks]);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const result = await api.post<SyncAllResult>(
        "/teaching/admin/sync-all",
        {},
      );
      const refreshedBanks = await fetchBanks();
      const updatedModules = syncResultToModules(refreshedBanks, result);
      setModules(updatedModules);
      setHasSynced(true);
      const summary = getSyncSummary(updatedModules);
      showMessage(summary);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sync request failed unexpectedly";
      setModules((prev) =>
        prev.map((m) => ({
          ...m,
          outcome: "error" as const,
          reason: "Sync request failed",
        })),
      );
      setHasSynced(true);
      showMessage({
        variant: "error",
        title: "Sync failed",
        description: message,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Container size="lg" py="xl">
      <SyncResultsPanel
        modules={modules}
        hasSynced={hasSynced}
        syncing={syncing}
        loading={loading}
        onSync={handleSyncAll}
        onRowClick={(row) => navigate(`/admin/teaching/modules/${row.bank_id}`)}
      />
    </Container>
  );
}
