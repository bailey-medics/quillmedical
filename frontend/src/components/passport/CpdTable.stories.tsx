/**
 * CpdTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import CpdTable from "./CpdTable";
import { cpdEntries, appraisalPeriod, shortAppraisalPeriod } from "./fixtures";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof CpdTable> = {
  title: "Passport/CPD table",
  component: CpdTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CpdTable>;

export const Default: Story = {
  args: {
    entries: cpdEntries,
    period: appraisalPeriod,
    onSelect: fn(),
  },
};

/**
 * The reason periods are a list rather than a single setting.
 */
export const AShortPeriodExplainsItself: Story = {
  render: (args) => (
    <Stack gap="sm">
      <CpdTable {...args} />
      <StoryNote>
        The same points across four months rather than twelve. Without the range
        stated, this would read as a poor year; with it, it reads as somebody
        who moved post and had their appraisal brought forward. That is why
        `appraisal_periods` is a history and not one current month.
      </StoryNote>
    </Stack>
  ),
  args: {
    entries: cpdEntries,
    period: shortAppraisalPeriod,
  },
};

/**
 * No period declared, so the fallback convention is named as one.
 */
export const NoPeriodDeclared: Story = {
  args: {
    entries: cpdEntries,
  },
};

export const Empty: Story = {
  args: {
    entries: [],
    period: appraisalPeriod,
  },
};

export const Loading: Story = {
  args: {
    entries: [],
    period: appraisalPeriod,
    isLoading: true,
  },
};
