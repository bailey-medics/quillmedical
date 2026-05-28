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
import StateMessage from "@/components/message-cards/StateMessage";
import DataTableWithResults, {
  type ResultColumn,
} from "@/components/tables/DataTableWithResults";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import { BodyTextInline } from "@/components/typography";
import { IconCircleCheck, IconAlertCircle } from "@/components/icons/appIcons";
import { statusColours } from "@/styles/semanticColours";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type SyncModuleOutcome = "imported" | "skipped" | "error";

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
  /** Callback when "Sync all" is clicked */
  onSync?: () => void;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function pluralise(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function getSummaryProps(modules: SyncModuleRow[]) {
  const imported = modules.filter((m) => m.outcome === "imported").length;
  const errors = modules.filter(
    (m) => m.outcome === "error" || m.outcome === "skipped",
  ).length;

  if (errors > 0) {
    return {
      icon: <IconAlertCircle />,
      title: "Sync complete with errors",
      description: `${imported} imported, ${errors} ${pluralise(errors, "error", "errors")}`,
      colour: "alert" as const,
    };
  }

  return {
    icon: <IconCircleCheck />,
    title: "Sync complete",
    description: `${imported} ${pluralise(imported, "module", "modules")} imported successfully`,
    colour: "success" as const,
  };
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
  if (row.outcome === "imported" || !row.reason) return null;
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
  onSync,
}: SyncResultsPanelProps) {
  const summary = getSummaryProps(modules);
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

      {hasSynced && (
        <StateMessage
          icon={summary.icon}
          title={summary.title}
          description={summary.description}
          colour={summary.colour}
        />
      )}

      <DataTableWithResults
        data={modules}
        columns={columns}
        getRowKey={(row) => row.bank_id}
        getSubRow={getSubRow}
        emptyMessage="No teaching modules found"
      />
    </Stack>
  );
}
