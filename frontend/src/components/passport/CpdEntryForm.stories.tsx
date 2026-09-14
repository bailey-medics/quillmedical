/**
 * CpdEntryForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import CpdEntryForm from "./CpdEntryForm";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof CpdEntryForm> = {
  title: "Passport/CPD entry form",
  component: CpdEntryForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CpdEntryForm>;

export const Default: Story = {
  args: {
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const Submitting: Story = {
  args: {
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: true,
  },
};

/**
 * Points are recorded but never totalled on the form.
 */
export const PointsAreNotTotalled: Story = {
  render: (args) => (
    <Stack gap="sm">
      <CpdEntryForm {...args} />
      <StoryNote>
        A form records one activity. What a period adds up to belongs to the
        table, which states the appraisal range it covers — a running total here
        would pre-empt that. One point is one hour, and points are optional
        because not every activity is claimed.
      </StoryNote>
    </Stack>
  ),
  args: {
    onSubmit: fn(),
    onCancel: fn(),
  },
};
