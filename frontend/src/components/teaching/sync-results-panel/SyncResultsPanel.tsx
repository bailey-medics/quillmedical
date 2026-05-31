/**
 * Sync Results Panel
 *
 * Displays the results of a teaching module sync operation.
 * Shows a StateMessage summary and a DataTableWithResults showing
 * each module's sync outcome. Failed modules show "Sync fail" with
 * the full reason in a sub-row beneath, always visible.
 *
 * Results persist on screen until the next sync is triggered.
 */

import { Group, Stack } from "@mantine/core";
import DataTableWithResults, {
  type ResultColumn,
} from "@/components/tables/DataTableWithResults";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import { BodyTextInline } from "@/components/typography";
import { statusColours } from "@/styles/semanticColours";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type SyncModuleOutcome = "imported" | "up_to_date" | "skipped" | "error";

export interface SyncModuleRow {
  /** Module/bank identifier */
  bank_id: string;
  /** Human-readable module name (falls back to bank_id) */
  title: string;
  /** Module type (uniform/variable) */
  type: string;
  /** Outcome of the sync for this module */
  outcome: SyncModuleOutcome;
  /** Version after sync */
  version: number;
  /** Item count */
  item_count: number;
  /** Reason for skip or error (empty for successful imports) */
  reason: string;
  /** ISO date string of the last successful sync (shown before sync) */
  last_synced?: string;
}

export interface SyncResultsPanelProps {
  /** Per-module sync results */
  modules: SyncModuleRow[];
  /** Whether a sync has been performed (controls column header and summary visibility) */
  hasSynced?: boolean;
  /** Whether a sync is currently in progress */
  syncing?: boolean;
  /** Whether data is loading */
  loading?: boolean;
  /** Callback when "Sync all" is clicked */
  onSync?: () => void;
  /** Callback when a module row is clicked */
  onRowClick?: (row: SyncModuleRow) => void;
}

// ------------------------------------------------------------------
// Table config
// ------------------------------------------------------------------

function getColumns(hasSynced: boolean): ResultColumn<SyncModuleRow>[] {
  return [
    { header: "Module", render: (row) => row.title },
    { header: "Type", render: (row) => row.type },
    { header: "Version", render: (row) => row.version },
    { header: "Items", render: (row) => row.item_count },
    {
      header: hasSynced ? "Status" : "Last synced",
      render: (row) => {
        if (!hasSynced) {
          if (!row.last_synced) return "Never";
          const d = new Date(row.last_synced);
          const dd = String(d.getDate()).padStart(2, "0");
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const yy = String(d.getFullYear());
          return `${dd}/${mm}/${yy}`;
        }
        if (row.outcome === "up_to_date") {
          return (
            <BodyTextInline c={statusColours.success.bg}>
              Up to date
            </BodyTextInline>
          );
        }
        return row.outcome === "imported" ? (
          <BodyTextInline c={statusColours.success.bg}>
            Sync pass
          </BodyTextInline>
        ) : (
          <BodyTextInline c={statusColours.alert.bg}>Sync fail</BodyTextInline>
        );
      },
    },
  ];
}

function getSubRow(row: SyncModuleRow) {
  if (row.outcome === "imported" || row.outcome === "up_to_date" || !row.reason)
    return null;
  return (
    <BodyTextInline c={statusColours.alert.bg}>{row.reason}</BodyTextInline>
  );
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export default function SyncResultsPanel({
  modules,
  hasSynced = false,
  syncing = false,
  loading = false,
  onSync,
  onRowClick,
}: SyncResultsPanelProps) {
  const columns = getColumns(hasSynced);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <PageHeader title="Teaching modules" />
        <IconTextButton
          icon="refresh"
          label="Sync all"
          onClick={onSync}
          disabled={syncing}
        />
      </Group>

      <DataTableWithResults
        data={modules}
        columns={columns}
        getRowKey={(row) => row.bank_id}
        getSubRow={getSubRow}
        onRowClick={onRowClick}
        emptyMessage="No teaching modules found"
        loading={loading}
      />
    </Stack>
  );
}
