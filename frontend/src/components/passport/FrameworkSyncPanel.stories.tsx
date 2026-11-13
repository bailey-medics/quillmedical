/**
 * FrameworkSyncPanel Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import FrameworkSyncPanel from "./FrameworkSyncPanel";
import type { FrameworkSyncRun, FrameworkSyncStatus } from "@lib/passport";

const meta: Meta<typeof FrameworkSyncPanel> = {
  title: "Passport/Framework sync panel",
  component: FrameworkSyncPanel,
  parameters: { layout: "padded" },
  args: { onSync: fn() },
};

export default meta;
type Story = StoryObj<typeof FrameworkSyncPanel>;

const lastRun: FrameworkSyncRun = {
  started_at: "2026-11-04T15:20:00Z",
  finished_at: "2026-11-04T15:21:30Z",
  status: "succeeded",
  versions_written: 2,
  error: null,
};

const succeeded: FrameworkSyncStatus = { configured: true, last_run: lastRun };

/** The last run stored two new versions. */
export const Default: Story = {
  args: { status: succeeded },
};

/** The last run found nothing new. */
export const UpToDate: Story = {
  args: {
    status: {
      configured: true,
      last_run: { ...lastRun, versions_written: 0 },
    },
  },
};

/** The last run failed, and says why. */
export const Failed: Story = {
  args: {
    status: {
      configured: true,
      last_run: {
        ...lastRun,
        status: "failed",
        versions_written: 0,
        error:
          "Framework 'quill_2_test' skipped version 2, so no version was stored.",
      },
    },
  },
};

/** No run yet. */
export const NeverSynced: Story = {
  args: { status: { configured: true, last_run: null } },
};

/** The button was pressed and the job has started. */
export const Started: Story = {
  args: { status: succeeded, started: true },
};

/** Pressed where no job is set up: a laptop or the end-to-end stack. */
export const NotSetUpHere: Story = {
  args: {
    status: { configured: false, last_run: null },
    refusal: "The framework sync is not set up here.",
  },
};

/** The start is on its way. */
export const Starting: Story = {
  args: { status: succeeded, starting: true },
};

export const Loading: Story = {
  args: { status: null, loading: true },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};

export const DarkModeFailed: Story = {
  ...Failed,
  globals: { colorScheme: "dark" },
};

export const DarkModeLoading: Story = {
  ...Loading,
  globals: { colorScheme: "dark" },
};
