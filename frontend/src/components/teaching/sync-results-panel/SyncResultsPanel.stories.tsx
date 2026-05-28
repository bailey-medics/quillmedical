/**
 * SyncResultsPanel Stories
 *
 * Shows the admin teaching modules page after a sync operation,
 * matching the real page layout with an added Status column.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import SyncResultsPanel from "./SyncResultsPanel";
import type { SyncModuleRow } from "./SyncResultsPanel";

const meta: Meta<typeof SyncResultsPanel> = {
  title: "Teaching/Sync results panel",
  component: SyncResultsPanel,
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof SyncResultsPanel>;

// ------------------------------------------------------------------
// Test data
// ------------------------------------------------------------------

const allPassed: SyncModuleRow[] = [
  {
    bank_id: "eoeeta-basic",
    title: "EoE/ETA basic assessment",
    type: "uniform",
    outcome: "imported",
    version: 2,
    item_count: 48,
    reason: "",
    last_synced: "2026-05-27T14:30:00Z",
  },
  {
    bank_id: "eoeeta-advanced",
    title: "EoE/ETA advanced assessment",
    type: "uniform",
    outcome: "imported",
    version: 1,
    item_count: 32,
    reason: "",
    last_synced: "2026-05-25T09:15:00Z",
  },
  {
    bank_id: "respiratory-basics",
    title: "Respiratory basics",
    type: "variable",
    outcome: "imported",
    version: 4,
    item_count: 60,
    reason: "",
  },
];

const withErrors: SyncModuleRow[] = [
  {
    bank_id: "eoeeta-basic",
    title: "EoE/ETA basic assessment",
    type: "uniform",
    outcome: "imported",
    version: 2,
    item_count: 48,
    reason: "",
  },
  {
    bank_id: "eoeeta-advanced",
    title: "EoE/ETA advanced assessment",
    type: "uniform",
    outcome: "error",
    version: 2,
    item_count: 32,
    reason:
      "Failed to download from GCS: connection timeout after 30s. The remote storage bucket 'bailey-medics-teaching-prod' did not respond within the configured timeout window. This may indicate a network connectivity issue between the application server and Google Cloud Storage, or the bucket may be temporarily unavailable due to a regional outage. Please verify that the service account has the correct IAM permissions (roles/storage.objectViewer) and that the bucket exists in the expected region (europe-west2).",
  },
  {
    bank_id: "respiratory-basics",
    title: "Respiratory basics",
    type: "variable",
    outcome: "error",
    version: 3,
    item_count: 60,
    reason: "Version 3 is not greater than stored version 3",
  },
];

// ------------------------------------------------------------------
// Stories
// ------------------------------------------------------------------

export const BeforeSync: Story = {
  args: {
    modules: allPassed,
  },
};

export const AllPassed: Story = {
  args: {
    modules: allPassed,
    hasSynced: true,
  },
};

export const WithErrors: Story = {
  args: {
    modules: withErrors,
    hasSynced: true,
  },
};

export const DarkMode: Story = {
  args: {
    modules: withErrors,
    hasSynced: true,
  },
  globals: { colorScheme: "dark" },
};
