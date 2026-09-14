/**
 * LogbookTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import LogbookTable from "./LogbookTable";
import { logbook, emptyLogbook, singleEntryLogbook } from "./fixtures";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof LogbookTable> = {
  title: "Passport/Logbook table",
  component: LogbookTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof LogbookTable>;

export const Default: Story = {
  args: {
    logbook,
    competencyName: "Perform bronchoscopy",
    onSelect: fn(),
  },
};

export const SingleEntry: Story = {
  args: {
    logbook: singleEntryLogbook,
    competencyName: "Perform thoracic ultrasound",
  },
};

export const Empty: Story = {
  args: {
    logbook: emptyLogbook,
    competencyName: "Prescribe systemic anti-cancer therapy",
  },
};

/**
 * A count and no target — the reason this table looks plainer than it
 * might.
 */
export const CountsNeverTargets: Story = {
  render: (args) => (
    <Stack gap="sm">
      <LogbookTable {...args} />
      <StoryNote>
        Thirty-eight entries, and nothing saying whether that is enough. Two
        hundred bronchoscopies prove activity, not competence — the sign-off is
        what turns evidence into a conclusion, and a progress bar here would
        appear to have decided that already.
      </StoryNote>
    </Stack>
  ),
  args: {
    logbook,
    competencyName: "Perform bronchoscopy",
  },
};

export const Loading: Story = {
  args: {
    logbook: emptyLogbook,
    competencyName: "Perform bronchoscopy",
    isLoading: true,
  },
};
